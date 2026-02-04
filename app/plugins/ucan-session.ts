import {
  getUcanSession,
  type Eip1193Provider,
  type UcanSessionKey,
} from "@yeying-community/web3-bs";
import { UCAN_SESSION_ID } from "./ucan";

const SESSION_CACHE_MS = 5 * 60 * 1000;
const SESSION_RENEW_SKEW_MS = 30 * 1000;
const SESSION_MIN_RETRY_MS = 10 * 1000;

let cachedSession: UcanSessionKey | null = null;
let cachedAt = 0;
let sessionPromise: Promise<UcanSessionKey | null> | null = null;
let lastAttemptAt = 0;

function normalizeExpiry(exp: number): number {
  return exp < 1e12 ? exp * 1000 : exp;
}

function isSessionFresh(session: UcanSessionKey | null) {
  if (!session) return false;
  if (typeof session.expiresAt === "number" && session.expiresAt > 0) {
    const expiresAt = normalizeExpiry(session.expiresAt);
    return expiresAt - SESSION_RENEW_SKEW_MS > Date.now();
  }
  return Date.now() - cachedAt < SESSION_CACHE_MS;
}

export async function getCachedUcanSession(
  provider?: Eip1193Provider,
): Promise<UcanSessionKey | null> {
  if (isSessionFresh(cachedSession)) {
    return cachedSession;
  }
  if (sessionPromise) {
    return await sessionPromise;
  }
  if (Date.now() - lastAttemptAt < SESSION_MIN_RETRY_MS) {
    return cachedSession;
  }

  lastAttemptAt = Date.now();
  sessionPromise = getUcanSession(UCAN_SESSION_ID, provider)
    .then((session) => {
      cachedSession = session;
      cachedAt = Date.now();
      lastAttemptAt = cachedAt;
      return session;
    })
    .catch((error) => {
      console.warn("❌获取 UCAN session 失败:", error);
      cachedSession = null;
      cachedAt = Date.now();
      return null;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return await sessionPromise;
}

export function clearCachedUcanSession() {
  cachedSession = null;
  cachedAt = 0;
  sessionPromise = null;
  lastAttemptAt = 0;
}
