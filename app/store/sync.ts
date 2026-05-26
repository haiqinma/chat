import { getClientConfig } from "../config/client";
import { ApiPath, CACHE_URL_PREFIX, STORAGE_KEY, StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import {
  AppState,
  getLocalAppState,
  getLocalAppStateForSync,
  GetStoreState,
  mergeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";
import {
  createSyncClient,
  ProviderType,
  type SyncClient,
} from "../utils/cloud";
import {
  readSyncState,
  resolveSyncStateBaseKey,
  withSyncStateLock,
  writeSyncState,
} from "../utils/cloud/transaction";
import {
  getCachedUcanSession,
  refreshUcanSession,
} from "../plugins/ucan-session";
import {
  isCentralModeEnabled,
  isCentralUcanAuthorized,
} from "../plugins/central-ucan";
import { getUcanRootCapsKey, getWebdavAudience } from "../plugins/ucan";
import { isValidUcanAuthorization } from "../plugins/wallet";

type ImageUrlPart = {
  type?: string;
  image_url?: {
    url?: string;
  };
};

type MessageLike = {
  content?: unknown;
  audio_url?: string;
};

type SkillLike = {
  context?: MessageLike[];
};

const CHATGPT_NEXT_WEB_FILE_CACHE = "chatgpt-next-web-file";

function toStableValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => toStableValue(item));
  }
  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      normalized[key] = toStableValue(value);
    }
    return normalized;
  }
  return input;
}

function stableSerialize(input: unknown) {
  return JSON.stringify(toStableValue(input));
}

function isCacheMediaUrl(url?: string) {
  return typeof url === "string" && url.includes(CACHE_URL_PREFIX);
}

function normalizeCacheUrl(url: string) {
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

function getCacheMediaKey(url: string) {
  try {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(url, origin);
    const pathPrefix = `${CACHE_URL_PREFIX}/`;
    if (!parsed.pathname.startsWith(pathPrefix)) return "";
    const relative = parsed.pathname.slice(pathPrefix.length);
    if (!relative) return "";
    return encodeURIComponent(relative);
  } catch {
    return "";
  }
}

function normalizeCacheMediaUrlForState(url: string) {
  try {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(url, origin);
    if (!parsed.pathname.startsWith(CACHE_URL_PREFIX)) return url;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

async function loadLocalCacheMediaBlob(url: string) {
  const normalizedUrl = normalizeCacheUrl(url);

  if (typeof caches !== "undefined") {
    // Prefer CacheStorage to avoid depending on ServiceWorker interception.
    const cached =
      (await caches.match(normalizedUrl)) ?? (await caches.match(url));
    if (cached) {
      return await cached.blob();
    }
  }

  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`load cache media failed: ${res.status} ${res.statusText}`);
  }
  return await res.blob();
}

function collectMessageMediaUrls(
  messages: MessageLike[] | undefined,
  mediaUrls: Set<string>,
) {
  if (!messages || messages.length === 0) return;

  for (const message of messages) {
    if (isCacheMediaUrl(message.audio_url)) {
      const normalizedUrl = normalizeCacheMediaUrlForState(
        message.audio_url as string,
      );
      message.audio_url = normalizedUrl;
      mediaUrls.add(normalizedUrl);
    }

    if (!Array.isArray(message.content)) continue;

    for (const part of message.content as ImageUrlPart[]) {
      if (part?.type !== "image_url") continue;
      const url = part?.image_url?.url;
      if (!isCacheMediaUrl(url)) continue;
      const normalizedUrl = normalizeCacheMediaUrlForState(url as string);
      if (part.image_url) {
        part.image_url.url = normalizedUrl;
      }
      mediaUrls.add(normalizedUrl);
    }
  }
}

function collectCacheMediaUrls(appState: AppState) {
  const mediaUrls = new Set<string>();
  const chatState = appState[StoreKey.Chat];

  for (const session of chatState.sessions) {
    collectMessageMediaUrls(session.messages as MessageLike[], mediaUrls);
    collectMessageMediaUrls(
      session.mask?.context as MessageLike[] | undefined,
      mediaUrls,
    );
  }

  const skillState = appState[StoreKey.Skill] as
    | ((typeof appState)[typeof StoreKey.Skill] & {
        masks?: Record<string, SkillLike>;
      })
    | undefined;
  const skills = (skillState?.skills ?? skillState?.masks ?? {}) as Record<
    string,
    SkillLike
  >;
  for (const skill of Object.values(skills)) {
    collectMessageMediaUrls(skill.context, mediaUrls);
  }

  return Array.from(mediaUrls);
}

async function hasLocalCacheMedia(url: string) {
  if (typeof caches === "undefined") return false;
  const normalizedUrl = normalizeCacheUrl(url);
  const cached =
    (await caches.match(normalizedUrl)) ?? (await caches.match(url));
  return !!cached;
}

async function putLocalCacheMedia(url: string, blob: Blob) {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(CHATGPT_NEXT_WEB_FILE_CACHE);
  const normalizedUrl = normalizeCacheUrl(url);
  const headers: Record<string, string> = {
    "cache-control": "no-cache",
    server: "WebDAV-Sync",
    "content-length": String(blob.size),
  };
  if (blob.type) {
    headers["content-type"] = blob.type;
  }
  await cache.put(new Request(normalizedUrl), new Response(blob, { headers }));
}

async function uploadCacheMediaForWebdav(
  appState: AppState,
  client: SyncClient,
) {
  if (!client.uploadMedia) return;
  const mediaUrls = collectCacheMediaUrls(appState);
  if (mediaUrls.length === 0) return;

  let successCount = 0;

  for (const mediaUrl of mediaUrls) {
    const mediaKey = getCacheMediaKey(mediaUrl);
    if (!mediaKey) continue;

    try {
      const blob = await loadLocalCacheMediaBlob(mediaUrl);
      await client.uploadMedia(mediaKey, blob, blob.type || undefined);
      successCount += 1;
    } catch (error) {
      console.warn("[Sync] failed to upload cache media to WebDAV", {
        mediaUrl,
        error,
      });
    }
  }

  console.info("[Sync] upload cache media to WebDAV done", {
    total: mediaUrls.length,
    successCount,
  });
}

async function hydrateCacheMediaFromWebdav(
  remoteState: AppState,
  client: SyncClient,
) {
  if (!client.downloadMedia || typeof caches === "undefined") return;
  const mediaUrls = collectCacheMediaUrls(remoteState);
  if (mediaUrls.length === 0) return;

  let restoreCount = 0;

  for (const mediaUrl of mediaUrls) {
    if (await hasLocalCacheMedia(mediaUrl)) continue;

    const mediaKey = getCacheMediaKey(mediaUrl);
    if (!mediaKey) continue;

    try {
      const blob = await client.downloadMedia(mediaKey);
      if (!blob) continue;
      await putLocalCacheMedia(mediaUrl, blob);
      restoreCount += 1;
    } catch (error) {
      console.warn("[Sync] failed to hydrate cache media from WebDAV", {
        mediaUrl,
        error,
      });
    }
  }

  console.info("[Sync] hydrate cache media from WebDAV done", {
    total: mediaUrls.length,
    restoreCount,
  });
}

async function getLocalAppStateForUpload(
  provider: ProviderType,
  client: SyncClient,
) {
  const state = getLocalAppStateForSync();

  if (provider === ProviderType.WebDAV) {
    await uploadCacheMediaForWebdav(state, client);
  }

  return state;
}

export type WebDavAuthType = "basic" | "ucan";

export interface WebDavConfig {
  authType: WebDavAuthType;
  baseUrl: string;
  prefix: string;
  endpoint: string;
  username: string;
  password: string;
}

const isApp = () => !!getClientConfig()?.isApp;
export type SyncStore = GetStoreState<typeof useSyncStore>;

const isUcanRootMetaReady = (): boolean => {
  try {
    if (isCentralModeEnabled()) {
      return isCentralUcanAuthorized();
    }
    if (typeof localStorage === "undefined") return false;
    const expRaw = localStorage.getItem("ucanRootExp");
    const iss = localStorage.getItem("ucanRootIss");
    const caps = localStorage.getItem("ucanRootCaps");
    const account = localStorage.getItem("currentAccount") || "";
    if (!expRaw || !iss || !account || !caps) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    if (caps !== getUcanRootCapsKey()) return false;
    return iss === `did:pkh:eth:${account.toLowerCase()}`;
  } catch {
    return false;
  }
};

const DEFAULT_SYNC_STATE = {
  provider: ProviderType.WebDAV,
  useProxy: false,
  proxyUrl: ApiPath.Cors as string,

  autoSync: true,
  autoSyncIntervalMs: 5 * 60 * 1000,
  autoSyncDebounceMs: 2000,

  webdav: {
    authType: "ucan" as WebDavAuthType,
    baseUrl: "",
    prefix: "",
    endpoint: "",
    username: "",
    password: "",
  },

  upstash: {
    endpoint: "",
    username: STORAGE_KEY,
    apiKey: "",
  },

  lastSyncTime: 0,
  lastProvider: "",
};

export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    cloudSync() {
      const provider = get().provider;
      if (provider === ProviderType.WebDAV) {
        const { baseUrl, username, password } = get().webdav;
        if (get().webdav.authType === "ucan") {
          const envBaseUrl =
            getClientConfig()?.webdavBackendBaseUrl?.trim() || "";
          const backendUrl = baseUrl.trim() || envBaseUrl;
          const audience = getWebdavAudience(backendUrl);
          return Boolean(backendUrl && audience && isUcanRootMetaReady());
        }
        return [baseUrl, username, password].every(
          (value) => value.toString().length > 0,
        );
      }
      const config = get()[provider];
      return Object.values(config).every((c) => c.toString().length > 0);
    },

    markSyncTime() {
      set({ lastSyncTime: Date.now(), lastProvider: get().provider });
    },

    export() {
      const state = getLocalAppState();
      const datePart = isApp()
        ? `${new Date().toLocaleDateString().replace(/\//g, "_")} ${new Date()
            .toLocaleTimeString()
            .replace(/:/g, "_")}`
        : new Date().toLocaleString();

      const fileName = `Backup-${datePart}.json`;
      downloadAs(JSON.stringify(state), fileName);
    },

    async import() {
      const rawContent = await readFromFile();

      try {
        const remoteState = JSON.parse(rawContent) as AppState;
        const localState = getLocalAppState();
        mergeAppState(localState, remoteState);
        setLocalAppState(localState);
        location.reload();
      } catch (e) {
        console.error("[Import]", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient() {
      const provider = get().provider;
      const client = createSyncClient(provider, get());
      return client;
    },

    async sync(options?: { interactive?: boolean }) {
      const provider = get().provider;
      const config = get()[provider];
      const interactive = options?.interactive ?? false;

      if (
        provider === ProviderType.WebDAV &&
        get().webdav.authType === "ucan" &&
        interactive
      ) {
        if (!isCentralModeEnabled()) {
          await refreshUcanSession();
        }
      } else if (
        provider === ProviderType.WebDAV &&
        get().webdav.authType === "ucan" &&
        !interactive
      ) {
        if (isCentralModeEnabled()) {
          if (!isCentralUcanAuthorized()) {
            return;
          }
        } else {
          const [session, authorized] = await Promise.all([
            getCachedUcanSession(),
            isValidUcanAuthorization(),
          ]);
          if (!session || !authorized) {
            return;
          }
        }
      }

      const client = createSyncClient(provider, get());
      const stateBaseKey = resolveSyncStateBaseKey(
        provider,
        config as { username?: string },
      );
      await withSyncStateLock(client, stateBaseKey, async () => {
        const persistLocalStateToRemote = async (reason: string) => {
          const latestLocalState = await getLocalAppStateForUpload(
            provider,
            client,
          );
          await writeSyncState(
            client,
            stateBaseKey,
            JSON.stringify(latestLocalState),
          );
          set({ lastSyncTime: Date.now(), lastProvider: provider });
          console.log(reason);
        };

        try {
          const remoteState = await readSyncState(client, stateBaseKey);
          if (!remoteState || remoteState === "") {
            await persistLocalStateToRemote(
              "[Sync] Remote state is empty, using local state instead.",
            );
            return;
          }

          const parsedRemoteState = JSON.parse(remoteState) as AppState;
          if (provider === ProviderType.WebDAV) {
            await hydrateCacheMediaFromWebdav(parsedRemoteState, client);
          }
          const latestLocalState = getLocalAppState();
          mergeAppState(latestLocalState, parsedRemoteState);
          setLocalAppState(latestLocalState);

          const latestLocalStateForSync = getLocalAppStateForSync();
          const hasStateDiff =
            stableSerialize(latestLocalStateForSync) !==
            stableSerialize(parsedRemoteState);

          if (!hasStateDiff) {
            set({ lastSyncTime: Date.now(), lastProvider: provider });
            console.log(
              "[Sync] Local state already matches remote, skip write.",
            );
            return;
          }

          if (provider === ProviderType.WebDAV) {
            await uploadCacheMediaForWebdav(latestLocalStateForSync, client);
          }
          await writeSyncState(
            client,
            stateBaseKey,
            JSON.stringify(latestLocalStateForSync),
          );
          set({ lastSyncTime: Date.now(), lastProvider: provider });
        } catch (e) {
          console.log("[Sync] failed to get remote state", e);
          throw e;
        }
      });
    },

    async check() {
      try {
        const provider = get().provider;
        if (
          provider === ProviderType.WebDAV &&
          get().webdav.authType === "ucan"
        ) {
          await refreshUcanSession();
        }
        const client = createSyncClient(provider, get());
        return await client.check();
      } catch (e) {
        console.error("[Sync] failed to check", e);
        return false;
      }
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.5,

    migrate(persistedState, version) {
      const newState = persistedState as typeof DEFAULT_SYNC_STATE;

      if (version < 1.1) {
        newState.upstash.username = STORAGE_KEY;
      }

      if (version < 1.2) {
        if (
          (persistedState as typeof DEFAULT_SYNC_STATE).proxyUrl ===
          "/api/cors/"
        ) {
          newState.proxyUrl = "";
        }
      }

      if (version < 1.3) {
        if (!newState.webdav.authType) {
          newState.webdav.authType = "basic";
        }
        if (typeof newState.autoSync !== "boolean") {
          newState.autoSync = true;
        }
        if (!newState.autoSyncIntervalMs) {
          newState.autoSyncIntervalMs = 5 * 60 * 1000;
        }
        if (!newState.autoSyncDebounceMs) {
          newState.autoSyncDebounceMs = 2000;
        }
      }

      if (version < 1.4) {
        const isDefaultWebdavConfig =
          newState.webdav.authType === "basic" &&
          !newState.webdav.endpoint &&
          !newState.webdav.username &&
          !newState.webdav.password;
        if (isDefaultWebdavConfig) {
          newState.webdav.authType = "ucan";
        }
        if (
          typeof newState.useProxy !== "boolean" ||
          (newState.useProxy && newState.proxyUrl === ApiPath.Cors)
        ) {
          newState.useProxy = false;
        }
        if (typeof newState.autoSync !== "boolean") {
          newState.autoSync = true;
        }
      }

      if (version < 1.5) {
        if (!newState.webdav.baseUrl) {
          const endpoint =
            (newState.webdav as { endpoint?: string }).endpoint || "";
          try {
            const url = new URL(endpoint);
            newState.webdav.baseUrl = `${url.protocol}//${url.host}`;
            const pathname = url.pathname.replace(/\/+$/, "");
            newState.webdav.prefix = pathname === "/" ? "" : pathname;
          } catch {
            newState.webdav.baseUrl = endpoint;
            newState.webdav.prefix = "";
          }
        }
        if (!newState.webdav.prefix) {
          newState.webdav.prefix = "";
        }
      }

      return newState as any;
    },
  },
);
