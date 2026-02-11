import { STORAGE_KEY } from "@/app/constant";
import { getClientConfig } from "@/app/config/client";
import {
  getWebdavAudience,
  getWebdavAppAction,
  getWebdavAppId,
  getWebdavCapabilities,
  getUcanCapsKey,
  getUcanRootCapsKey,
  UCAN_SESSION_ID,
} from "@/app/plugins/ucan";
import { SyncStore } from "@/app/store/sync";
import {
  getStoredUcanRoot,
  initWebDavStorage,
} from "@yeying-community/web3-bs";
import { getCachedUcanSession } from "@/app/plugins/ucan-session";
import {
  acquireUcanSignLock,
  isUcanSignPending,
  isUcanSignPendingError,
  refreshUcanSignLock,
  releaseUcanSignLock,
} from "@/app/plugins/ucan-sign-lock";

export type WebDAVConfig = SyncStore["webdav"];
export type WebDavClient = ReturnType<typeof createWebDavClient>;

const DEFAULT_FOLDER = STORAGE_KEY;
const BACKUP_FILENAME = "backup.json";
const DEFAULT_FILE = `${DEFAULT_FOLDER}/${BACKUP_FILENAME}`;
const WEBDAV_PROXY_PREFIX = "/api/webdav";
const ensuredAppDirs = new Set<string>();

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function normalizePrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  let next = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  next = next.replace(/\/+$/, "");
  return next === "/" ? "" : next;
}

function joinBasePrefix(baseUrl: string, prefix: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) return base;
  return `${base}${normalizedPrefix}`;
}

function getEnvWebdavBaseUrl(): string {
  return getClientConfig()?.webdavBackendBaseUrl?.trim() || "";
}

function getEnvWebdavPrefix(): string {
  return getClientConfig()?.webdavBackendPrefix?.trim() || "";
}

function resolveWebdavBaseUrl(store: SyncStore, fallbackBaseUrl = ""): string {
  const config = store.webdav;
  if (config.baseUrl.trim()) return normalizeBaseUrl(config.baseUrl);
  if (fallbackBaseUrl.trim()) return normalizeBaseUrl(fallbackBaseUrl);
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint;
  }
}

function resolveWebdavPrefix(
  store: SyncStore,
  fallbackPrefix = "",
  fallbackBaseUrl = "",
): string {
  const config = store.webdav;
  const storePrefix = config.prefix.trim();
  const storeBase = config.baseUrl.trim();
  if (storeBase) {
    return normalizePrefix(storePrefix);
  }
  if (fallbackBaseUrl.trim()) {
    return normalizePrefix(storePrefix || fallbackPrefix);
  }
  if (storePrefix) return normalizePrefix(storePrefix);
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    const pathname = url.pathname.replace(/\/+$/, "");
    return pathname === "/" ? "" : pathname;
  } catch {
    return "";
  }
}

function createBasicWebDavClient(store: SyncStore) {
  const config = store.webdav;
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : "";
  const envBaseUrl = getEnvWebdavBaseUrl();
  const envPrefix = getEnvWebdavPrefix();
  const baseUrl = resolveWebdavBaseUrl(store, envBaseUrl);
  const prefix = resolveWebdavPrefix(store, envPrefix, envBaseUrl);
  const endpoint = joinBasePrefix(baseUrl, prefix);

  return {
    async check() {
      try {
        const res = await fetch(
          this.path(DEFAULT_FOLDER, proxyUrl, "MKCOL", endpoint),
          {
            method: "GET",
            headers: this.headers(),
          },
        );
        const success = [201, 200, 404, 405, 301, 302, 307, 308].includes(
          res.status,
        );
        console.log(
          `[WebDav] check ${success ? "success" : "failed"}, ${res.status} ${
            res.statusText
          }`,
        );
        return success;
      } catch (e) {
        console.error("[WebDav] failed to check", e);
      }

      return false;
    },

    async get(key: string) {
      const res = await fetch(this.path(DEFAULT_FILE, proxyUrl, "", endpoint), {
        method: "GET",
        headers: this.headers(),
      });

      console.log("[WebDav] get key = ", key, res.status, res.statusText);

      if (404 == res.status) {
        return "";
      }

      return await res.text();
    },

    async set(key: string, value: string) {
      const res = await fetch(this.path(DEFAULT_FILE, proxyUrl, "", endpoint), {
        method: "PUT",
        headers: this.headers(),
        body: value,
      });

      console.log("[WebDav] set key = ", key, res.status, res.statusText);
    },

    headers() {
      const auth = btoa(config.username + ":" + config.password);

      return {
        authorization: `Basic ${auth}`,
      };
    },
    path(
      path: string,
      proxyUrl: string = "",
      proxyMethod: string = "",
      endpointUrl: string = "",
    ) {
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.endsWith("/")) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      const resolvedEndpoint = endpointUrl || endpoint;

      let url;
      const pathPrefix = `${WEBDAV_PROXY_PREFIX}/`;

      try {
        if (!store.useProxy && resolvedEndpoint) {
          const direct = joinBasePrefix(resolvedEndpoint, "");
          url = `${direct}/${path}`;
        } else {
          let u = new URL(proxyUrl + pathPrefix + path);
          // add query params
          u.searchParams.append("endpoint", resolvedEndpoint);
          proxyMethod && u.searchParams.append("proxy_method", proxyMethod);
          url = u.toString();
        }
      } catch (e) {
        if (!store.useProxy && resolvedEndpoint) {
          url = `${resolvedEndpoint.replace(/\/+$/, "")}/${path}`;
        } else {
          url = pathPrefix + path + "?endpoint=" + resolvedEndpoint;
          if (proxyMethod) {
            url += "&proxy_method=" + proxyMethod;
          }
        }
      }

      return url;
    },
  };
}

function createWebdavProxyFetcher(endpoint: string) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin && window.location.origin !== "null"
          ? window.location.origin
          : window.location.href;
    const raw = typeof input === "string" ? input : input.toString();
    const url = new URL(raw, origin);
    if (url.pathname.startsWith(WEBDAV_PROXY_PREFIX)) {
      url.searchParams.set("endpoint", endpoint);
    }
    return fetch(url.toString(), init);
  };
}

async function getUcanWebDavClient(store: SyncStore) {
  const envBaseUrl = getEnvWebdavBaseUrl();
  const envPrefix = getEnvWebdavPrefix();
  console.log("[WebDav UCAN] config", {
    useProxy: store.useProxy,
    backendBaseUrl: envBaseUrl,
    backendPrefix: envPrefix,
    authType: store.webdav.authType,
  });
  const backendUrl = resolveWebdavBaseUrl(store, envBaseUrl);
  if (!backendUrl) {
    throw new Error("WEBDAV_BACKEND_BASE_URL is not configured");
  }
  const webdavPrefix = resolveWebdavPrefix(store, envPrefix, envBaseUrl);
  const audience = getWebdavAudience(backendUrl);
  if (!audience) {
    throw new Error("WebDAV UCAN audience is not configured");
  }
  const useProxy = store.useProxy;
  const endpoint = joinBasePrefix(backendUrl, webdavPrefix);
  const baseUrl = useProxy ? "" : backendUrl;
  const prefix = useProxy ? WEBDAV_PROXY_PREFIX : webdavPrefix;
  const fetcher = useProxy ? createWebdavProxyFetcher(endpoint) : undefined;

  const session = await getCachedUcanSession();
  if (!session) {
    throw new Error("UCAN session is not available");
  }
  const root = await getStoredUcanRoot(UCAN_SESSION_ID);
  if (!root) {
    throw new Error("UCAN root is not ready");
  }
  if (root.aud && root.aud !== session.did) {
    throw new Error("UCAN root audience mismatch");
  }
  if (getUcanCapsKey(root.cap) !== getUcanRootCapsKey()) {
    throw new Error("UCAN root capability mismatch");
  }
  if (typeof root.exp === "number" && root.exp <= Date.now()) {
    throw new Error("UCAN root expired");
  }

  if (isUcanSignPending()) {
    throw new Error("UCAN sign pending");
  }

  if (!acquireUcanSignLock()) {
    throw new Error("UCAN sign pending");
  }

  let webdav: Awaited<ReturnType<typeof initWebDavStorage>>;
  try {
    webdav = await initWebDavStorage({
      baseUrl,
      prefix,
      audience,
      appId: getWebdavAppId(),
      appAction: getWebdavAppAction(),
      capabilities: root.cap,
      invocationCapabilities: getWebdavCapabilities(),
      sessionId: UCAN_SESSION_ID,
      session,
      root,
      fetcher,
      ensureAppDir: false,
    });
    releaseUcanSignLock();
  } catch (error) {
    if (isUcanSignPendingError(error)) {
      refreshUcanSignLock();
    } else {
      releaseUcanSignLock();
    }
    throw error;
  }

  const appDir = webdav.appDir?.replace(/\/+$/, "") || "";
  const filePath = `${appDir || ""}/${BACKUP_FILENAME}`;

  if (appDir) {
    const key = `${baseUrl}|${prefix}|${appDir}`;
    if (!ensuredAppDirs.has(key)) {
      try {
        const res = await webdav.client.createDirectory(appDir);
        if (![201, 405, 409].includes(res.status)) {
          throw new Error(`WebDAV MKCOL ${appDir} failed: ${res.status}`);
        }
        ensuredAppDirs.add(key);
      } catch (error) {
        console.error("[WebDav UCAN] ensure app dir failed", error);
      }
    }
  }

  return { client: webdav.client, filePath };
}

function createUcanWebDavClient(store: SyncStore) {
  return {
    async check() {
      try {
        const { client } = await getUcanWebDavClient(store);
        await client.getQuota();
        return true;
      } catch (e) {
        console.error("[WebDav UCAN] failed to check", e);
      }
      return false;
    },

    async get(_: string) {
      const { client, filePath } = await getUcanWebDavClient(store);
      try {
        return await client.downloadText(filePath);
      } catch (e) {
        if (String(e).includes("404")) {
          return "";
        }
        throw e;
      }
    },

    async set(_: string, value: string) {
      const { client, filePath } = await getUcanWebDavClient(store);
      await client.upload(filePath, value, "application/json");
    },
  };
}

export function createWebDavClient(store: SyncStore) {
  if (store.webdav.authType === "ucan") {
    return createUcanWebDavClient(store);
  }
  return createBasicWebDavClient(store);
}
