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

function createBasicWebDavClient(store: SyncStore) {
  const config = store.webdav;
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : "";

  return {
    async check() {
      try {
        const res = await fetch(this.path(DEFAULT_FOLDER, proxyUrl, "MKCOL"), {
          method: "GET",
          headers: this.headers(),
        });
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
      const res = await fetch(this.path(DEFAULT_FILE, proxyUrl), {
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
      const res = await fetch(this.path(DEFAULT_FILE, proxyUrl), {
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
    path(path: string, proxyUrl: string = "", proxyMethod: string = "") {
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.endsWith("/")) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      let url;
      const pathPrefix = `${WEBDAV_PROXY_PREFIX}/`;

      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        proxyMethod && u.searchParams.append("proxy_method", proxyMethod);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path + "?endpoint=" + config.endpoint;
        if (proxyMethod) {
          url += "&proxy_method=" + proxyMethod;
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
  console.log("[WebDav UCAN] config", {
    useProxy: store.useProxy,
    backendUrl: getClientConfig()?.webdavBackendUrl ?? "",
    authType: store.webdav.authType,
  });
  const backendUrl = getClientConfig()?.webdavBackendUrl?.trim();
  if (!backendUrl) {
    throw new Error("WEBDAV_BACKEND_URL is not configured");
  }
  const audience = getWebdavAudience();
  if (!audience) {
    throw new Error("WebDAV UCAN audience is not configured");
  }
  const useProxy = store.useProxy;
  const baseUrl = useProxy ? "" : backendUrl;
  const prefix = useProxy ? WEBDAV_PROXY_PREFIX : "";
  const fetcher = useProxy ? createWebdavProxyFetcher(backendUrl) : undefined;

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
