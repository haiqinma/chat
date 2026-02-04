import { getClientConfig } from "../config/client";
import { ApiPath, STORAGE_KEY, StoreKey } from "../constant";
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
import { createSyncClient, ProviderType } from "../utils/cloud";
import { getUcanRootCapsKey, getWebdavAudience } from "../plugins/ucan";

export type WebDavAuthType = "basic" | "ucan";

export interface WebDavConfig {
  authType: WebDavAuthType;
  endpoint: string;
  username: string;
  password: string;
}

const isApp = !!getClientConfig()?.isApp;
export type SyncStore = GetStoreState<typeof useSyncStore>;

const isUcanRootMetaReady = (): boolean => {
  try {
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
        if (get().webdav.authType === "ucan") {
          const backendUrl = getClientConfig()?.webdavBackendUrl?.trim();
          const audience = getWebdavAudience();
          return Boolean(backendUrl && audience && isUcanRootMetaReady());
        }
        const { endpoint, username, password } = get().webdav;
        return [endpoint, username, password].every(
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
      const datePart = isApp
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

    async sync() {
      const provider = get().provider;
      const config = get()[provider];
      const client = this.getClient();

      try {
        const remoteState = await client.get(config.username);
        if (!remoteState || remoteState === "") {
          const latestLocalState = getLocalAppStateForSync();
          await client.set(config.username, JSON.stringify(latestLocalState));
          console.log(
            "[Sync] Remote state is empty, using local state instead.",
          );
          return;
        }

        const parsedRemoteState = JSON.parse(remoteState) as AppState;
        const latestLocalState = getLocalAppState();
        mergeAppState(latestLocalState, parsedRemoteState);
        setLocalAppState(latestLocalState);
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);
        throw e;
      }

      const latestLocalState = getLocalAppStateForSync();
      await client.set(config.username, JSON.stringify(latestLocalState));

      this.markSyncTime();
    },

    async check() {
      const client = this.getClient();
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.4,

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

      return newState as any;
    },
  },
);
