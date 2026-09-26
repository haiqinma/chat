import { getClientConfig } from "@/app/config/client";
import { fetch as desktopAwareFetch } from "@/app/utils/stream";
import {
  getCapabilityAction,
  getCapabilityResource,
  normalizeUcanCapabilities,
} from "@yeying-community/web3-bs";

export const UCAN_AUTH_MODE_KEY = "ucanAuthMode";
export const UCAN_AUTH_MODE_WALLET = "wallet";
export const UCAN_AUTH_MODE_CENTRAL = "central";
export const UCAN_AUTH_EVENT = "ucan-auth-change";

const CENTRAL_UCAN_TOKEN_KEY = "centralUcanToken";
const CENTRAL_ACCESS_TOKEN_KEY = "centralAccessToken";
const CENTRAL_UCAN_EXPIRES_AT_KEY = "centralUcanExpiresAt";
const CENTRAL_ACCESS_EXPIRES_AT_KEY = "centralAccessExpiresAt";
const CENTRAL_UCAN_TOKENS_KEY = "centralUcanTokensV1";
const CENTRAL_SESSION_TOKEN_KEY = "centralIssueSessionToken";
const CENTRAL_SESSION_EXPIRES_AT_KEY = "centralIssueSessionExpiresAt";
const CENTRAL_REFRESH_TOKEN_KEY = "centralIdentityRefreshToken";
const CENTRAL_REFRESH_EXPIRES_AT_KEY = "centralIdentityRefreshExpiresAt";
const CENTRAL_SUBJECT_KEY = "centralAuthSubject";
const CENTRAL_IDENTITY_DID_KEY = "centralIdentityDid";
const CENTRAL_WALLET_ADDRESS_KEY = "centralWalletAddress";
const CENTRAL_IDENTITY_CREDENTIALS_KEY = "centralIdentityCredentials";
const CENTRAL_AUTHORIZE_SESSION_PREFIX = "centralIdentityAuthorizeSession:";
const CURRENT_IDENTITY_DID_KEY = "currentIdentityDid";
const CURRENT_WALLET_ADDRESS_KEY = "currentWalletAddress";
const TOKEN_SKEW_MS = 5 * 1000;

type Envelope<T> = {
  code: number;
  message: string;
  data: T;
  timestamp: number;
};

export type UcanCapability = {
  with?: string;
  can?: string;
  resource?: string;
  action?: string;
};

type DecodedJwtPayload = {
  exp?: number;
  nbf?: number;
  aud?: string;
  cap?: unknown;
  iat?: number;
};

type CentralUcanTokenRecord = {
  token: string;
  audience: string;
  capabilities: UcanCapability[];
  capsKey: string;
  expiresAt: number;
  notBefore?: number | null;
  issuedAt: number;
};

type CentralUcanTokenStore = Record<string, CentralUcanTokenRecord>;

type CentralIssueSessionResult = {
  subject?: string;
  issuerDid?: string;
  sessionToken: string;
  issuedAt?: number;
  expiresAt?: number;
};

type CentralIssueResult = {
  ucan: string;
  issuer?: string;
  issuerDid?: string;
  subject?: string;
  audience?: string;
  capabilities?: UcanCapability[];
  notBefore?: number;
  expiresAt?: number;
  nbf?: number;
  exp?: number;
  iat?: number;
  issuedAt?: number;
};

export type CentralAuthorizeRequestResult = {
  requestId: string;
  status: string;
  appId: string;
  appName?: string;
  redirectUri: string;
  state?: string;
  audience: string;
  nonce?: string;
  scopes: string[];
  expiresAt: string | number;
  verifyUrl: string;
  codeChallengeMethod?: string;
};

export type CentralAuthorizeExchangeResult = {
  requestId: string;
  appId: string;
  redirectUri: string;
  state?: string;
  did: string;
  walletIdentityId?: string;
  walletAddress?: string;
  scopes: string[];
  credentials?: Array<{
    type: string;
    credentialId: string;
    credential: string;
  }>;
  issuedAt?: string | number;
  token?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
  refreshToken?: string;
  ucan?: string;
  issuer?: string;
  audience?: string;
  capabilities?: UcanCapability[];
  notBefore?: number;
  ucanExpiresAt?: number;
  ucanSession?: {
    sessionToken: string;
    issuerDid?: string;
    issuedAt?: number;
    expiresAt?: number;
  };
};

type CentralRefreshSessionResult = {
  did: string;
  walletAddress?: string;
  scopes?: string[];
  refreshToken: string;
  refreshExpiresAt?: number;
  ucanSession: {
    sessionToken: string;
    issuerDid?: string;
    issuedAt?: number;
    expiresAt?: number;
  };
};

export type CentralAuthorizeApprovalResult = {
  requestId: string;
  did: string;
  authorizationCode: string;
  authorizationCodeExpiresAt: string | number;
  redirectTo: string;
};

export type UcanAuthMode =
  typeof UCAN_AUTH_MODE_WALLET | typeof UCAN_AUTH_MODE_CENTRAL;

type HttpError = Error & {
  status?: number;
};

let centralSessionPromise: Promise<string> | null = null;
let centralRefreshPromise: Promise<CentralRefreshSessionResult> | null = null;
const centralIssuePromises = new Map<string, Promise<CentralUcanTokenRecord>>();

export type CentralAuthorizeSession = {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectPath: string;
  createdAt: number;
};

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
}

function normalizeEpochMs(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

function decodeBase64Url(input: string): string | null {
  if (!input) return null;
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): DecodedJwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const text = decodeBase64Url(parts[1]);
  if (!text) return null;
  try {
    return JSON.parse(text) as DecodedJwtPayload;
  } catch {
    return null;
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

function getAuthorizeSessionKey(state: string): string {
  return `${CENTRAL_AUTHORIZE_SESSION_PREFIX}${state}`;
}

export async function createCentralAuthorizeSession(
  redirectPath: string,
): Promise<CentralAuthorizeSession> {
  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(48);
  const session: CentralAuthorizeSession = {
    state,
    codeVerifier,
    codeChallenge: await sha256Base64Url(codeVerifier),
    redirectPath,
    createdAt: Date.now(),
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      getAuthorizeSessionKey(state),
      JSON.stringify(session),
    );
  }
  return session;
}

export function getCentralAuthorizeSession(
  state?: string | null,
): CentralAuthorizeSession | null {
  const normalizedState = String(state || "").trim();
  if (!normalizedState || typeof localStorage === "undefined") return null;
  const key = getAuthorizeSessionKey(normalizedState);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CentralAuthorizeSession;
    if (
      parsed?.state !== normalizedState ||
      !parsed.codeVerifier ||
      !parsed.redirectPath
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumeCentralAuthorizeSession(
  state?: string | null,
): CentralAuthorizeSession | null {
  const normalizedState = String(state || "").trim();
  const session = getCentralAuthorizeSession(normalizedState);
  if (session && typeof localStorage !== "undefined") {
    localStorage.removeItem(getAuthorizeSessionKey(normalizedState));
  }
  return session;
}

function parseStoredExpireAt(key: string): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return normalizeEpochMs(parsed) ?? null;
}

function storeExpireAt(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeEpochMs(value);
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(normalized));
}

function parseTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return normalizeEpochMs(payload.exp);
}

function normalizeCapabilities(raw: unknown): UcanCapability[] {
  if (!Array.isArray(raw)) return [];
  const caps: UcanCapability[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const withValue =
      (typeof source.with === "string" && source.with.trim()) ||
      (typeof source.resource === "string" && source.resource.trim()) ||
      "";
    const canValue =
      (typeof source.can === "string" && source.can.trim()) ||
      (typeof source.action === "string" && source.action.trim()) ||
      "";
    if (!withValue || !canValue) continue;
    caps.push({
      with: withValue,
      can: canValue,
      resource: withValue,
      action: canValue,
    });
  }
  return normalizeUcanCapabilities(caps, {
    includeLegacyAliases: false,
  }) as UcanCapability[];
}

function buildCapsKey(capabilities?: UcanCapability[]): string {
  return normalizeUcanCapabilities(capabilities || [], {
    includeLegacyAliases: false,
  })
    .map((cap) => {
      const resource = getCapabilityResource(cap);
      const action = getCapabilityAction(cap);
      return `${resource}:${action}`;
    })
    .filter((entry) => entry !== ":")
    .sort()
    .join("|");
}

function buildAudienceCapsCacheKey(
  audience: string,
  capabilities?: UcanCapability[],
): string {
  return `${audience.trim()}|${buildCapsKey(capabilities || [])}`;
}

function createHttpError(message: string, status?: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function parseApiErrorText(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as Envelope<unknown>;
    if (parsed?.message) return parsed.message;
  } catch {
    return text;
  }
  return fallback;
}

function clearLegacyUcanToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CENTRAL_UCAN_TOKEN_KEY);
  localStorage.removeItem(CENTRAL_UCAN_EXPIRES_AT_KEY);
}

function clearCentralSessionTokenCache() {
  centralSessionPromise = null;
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CENTRAL_SESSION_TOKEN_KEY);
  localStorage.removeItem(CENTRAL_SESSION_EXPIRES_AT_KEY);
}

function clearCentralRefreshToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CENTRAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(CENTRAL_REFRESH_EXPIRES_AT_KEY);
}

function readCentralRefreshToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = (localStorage.getItem(CENTRAL_REFRESH_TOKEN_KEY) || "").trim();
  if (!token) return null;
  const expiresAt = parseStoredExpireAt(CENTRAL_REFRESH_EXPIRES_AT_KEY);
  if (expiresAt && expiresAt <= Date.now() + TOKEN_SKEW_MS) {
    clearCentralRefreshToken();
    return null;
  }
  return token;
}

function persistCentralRefreshToken(token: string, expiresAt?: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CENTRAL_REFRESH_TOKEN_KEY, token);
  storeExpireAt(CENTRAL_REFRESH_EXPIRES_AT_KEY, expiresAt);
}

function readSessionTokenFromStorage(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = (localStorage.getItem(CENTRAL_SESSION_TOKEN_KEY) || "").trim();
  if (!token) return null;
  const expiresAt = parseStoredExpireAt(CENTRAL_SESSION_EXPIRES_AT_KEY);
  if (!isTokenValid(token, expiresAt, null)) {
    clearCentralSessionTokenCache();
    return null;
  }
  return token;
}

function persistSessionToken(sessionToken: string, expiresAt?: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CENTRAL_SESSION_TOKEN_KEY, sessionToken);
  storeExpireAt(CENTRAL_SESSION_EXPIRES_AT_KEY, expiresAt);
}

function loadCentralUcanTokenStore(): CentralUcanTokenStore {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(CENTRAL_UCAN_TOKENS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: CentralUcanTokenStore = {};
    let changed = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") {
        changed = true;
        continue;
      }
      const source = value as Record<string, unknown>;
      const token = typeof source.token === "string" ? source.token.trim() : "";
      const audience =
        typeof source.audience === "string" ? source.audience.trim() : "";
      const capabilities = normalizeCapabilities(source.capabilities);
      const capsKey = buildCapsKey(capabilities);
      const expiresAt = normalizeEpochMs(source.expiresAt);
      const notBefore = normalizeEpochMs(source.notBefore);
      const issuedAt = normalizeEpochMs(source.issuedAt) || Date.now();
      if (!token || !audience || !expiresAt) {
        changed = true;
        continue;
      }
      if (!isTokenValid(token, expiresAt, notBefore)) {
        changed = true;
        continue;
      }
      const expectedKey = buildAudienceCapsCacheKey(audience, capabilities);
      if (key !== expectedKey) {
        changed = true;
      }
      next[expectedKey] = {
        token,
        audience,
        capabilities,
        capsKey,
        expiresAt,
        notBefore,
        issuedAt,
      };
    }
    if (changed) {
      localStorage.setItem(CENTRAL_UCAN_TOKENS_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    localStorage.removeItem(CENTRAL_UCAN_TOKENS_KEY);
    return {};
  }
}

function saveCentralUcanTokenStore(store: CentralUcanTokenStore) {
  if (typeof localStorage === "undefined") return;
  const values = Object.values(store);
  if (!values.length) {
    localStorage.removeItem(CENTRAL_UCAN_TOKENS_KEY);
    return;
  }
  localStorage.setItem(CENTRAL_UCAN_TOKENS_KEY, JSON.stringify(store));
}

function persistCentralUcanToken(record: CentralUcanTokenRecord) {
  if (typeof localStorage === "undefined") return;
  const key = buildAudienceCapsCacheKey(record.audience, record.capabilities);
  const store = loadCentralUcanTokenStore();
  store[key] = {
    ...record,
    capsKey: buildCapsKey(record.capabilities),
  };
  saveCentralUcanTokenStore(store);
}

function getLatestValidCentralUcanTokenRecord(): CentralUcanTokenRecord | null {
  const store = loadCentralUcanTokenStore();
  let latest: CentralUcanTokenRecord | null = null;
  for (const record of Object.values(store)) {
    if (!isTokenValid(record.token, record.expiresAt, record.notBefore)) {
      continue;
    }
    if (!latest || record.expiresAt > latest.expiresAt) {
      latest = record;
    }
  }
  return latest;
}

function getMatchingCentralUcanTokenRecord(
  audience: string,
  capabilities?: UcanCapability[],
): CentralUcanTokenRecord | null {
  const normalizedAudience = audience.trim();
  if (!normalizedAudience) return null;
  const store = loadCentralUcanTokenStore();
  const targetKey = buildAudienceCapsCacheKey(normalizedAudience, capabilities);
  const exact = store[targetKey];
  if (exact && isTokenValid(exact.token, exact.expiresAt, exact.notBefore)) {
    return exact;
  }
  const targetCapsKey = buildCapsKey(capabilities || []);
  if (!targetCapsKey) {
    const matched = Object.values(store)
      .filter((record) => record.audience === normalizedAudience)
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];
    if (
      matched &&
      isTokenValid(matched.token, matched.expiresAt, matched.notBefore)
    ) {
      return matched;
    }
  }
  return null;
}

function clearCentralUcanTokenStore() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CENTRAL_UCAN_TOKENS_KEY);
}

function persistLegacyToken(token: string, expiresAt?: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CENTRAL_UCAN_TOKEN_KEY, token);
  storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, expiresAt);
}

function isTokenValid(
  token: string,
  expiresAt: number | null,
  notBefore?: number | null,
) {
  if (!token) return false;
  const now = Date.now();
  if (notBefore && now < notBefore) return false;
  if (!expiresAt) return false;
  return expiresAt > now + TOKEN_SKEW_MS;
}

async function requestCentralIssueSession(options?: { baseUrl?: string }) {
  const cached = readSessionTokenFromStorage();
  if (cached) return cached;
  if (centralSessionPromise) {
    return await centralSessionPromise;
  }
  centralSessionPromise = (async () => {
    const refreshToken = readCentralRefreshToken();
    if (refreshToken) {
      try {
        const refreshed = await refreshCentralIdentitySession(options);
        return refreshed.ucanSession.sessionToken;
      } catch (error) {
        const status = (error as HttpError)?.status;
        if (status !== 401 && status !== 410) throw error;
        clearCentralRefreshToken();
      }
    }

    const accessToken = getCentralAccessToken();
    if (!accessToken) {
      throw new Error("中心化登录已过期，请重新登录");
    }
    const subject = getCentralAccount();
    const response = await desktopAwareFetch(
      buildApiUrl("/api/v1/public/auth/central/session", options?.baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          subject: subject || undefined,
        }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      const message = parseApiErrorText(
        text,
        `创建中心化签发会话失败: ${response.status}`,
      );
      throw createHttpError(message, response.status);
    }
    const data = parseEnvelope<CentralIssueSessionResult>(
      text,
      "创建中心化签发会话失败",
    );
    const sessionToken = String(data.sessionToken || "").trim();
    if (!sessionToken) {
      throw new Error("中心化签发会话返回为空");
    }
    persistSessionToken(sessionToken, data.expiresAt);
    return sessionToken;
  })();
  try {
    return await centralSessionPromise;
  } finally {
    centralSessionPromise = null;
  }
}

export async function refreshCentralIdentitySession(options?: {
  baseUrl?: string;
}): Promise<CentralRefreshSessionResult> {
  const refreshToken = readCentralRefreshToken();
  if (!refreshToken) {
    throw new Error("中心化登录续期凭证已过期，请重新登录");
  }
  if (centralRefreshPromise) return await centralRefreshPromise;

  centralRefreshPromise = (async () => {
    const response = await desktopAwareFetch(
      buildApiUrl("/api/v1/public/identity/session/refresh", options?.baseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          refreshToken,
          appId: getCentralAppId(),
          redirectUri: (() => {
            const configured =
              getClientConfig()?.centralUcanRedirectUri?.trim();
            if (configured) return configured;
            if (typeof window !== "undefined") {
              return `${window.location.origin}/central-ucan-callback.html`;
            }
            return "";
          })(),
        }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      throw createHttpError(
        parseApiErrorText(text, `中心化登录续期失败: ${response.status}`),
        response.status,
      );
    }
    const data = parseEnvelope<CentralRefreshSessionResult>(
      text,
      "中心化登录续期失败",
    );
    const sessionToken = String(data.ucanSession?.sessionToken || "").trim();
    const nextRefreshToken = String(data.refreshToken || "").trim();
    if (!sessionToken || !nextRefreshToken) {
      throw new Error("中心化登录续期响应无效");
    }
    persistSessionToken(sessionToken, data.ucanSession?.expiresAt);
    persistCentralRefreshToken(nextRefreshToken, data.refreshExpiresAt);
    if (data.did) {
      localStorage.setItem(CENTRAL_IDENTITY_DID_KEY, data.did);
      localStorage.setItem(CURRENT_IDENTITY_DID_KEY, data.did);
    }
    if (data.walletAddress) {
      localStorage.setItem(CENTRAL_WALLET_ADDRESS_KEY, data.walletAddress);
      localStorage.setItem(CURRENT_WALLET_ADDRESS_KEY, data.walletAddress);
      localStorage.setItem("currentAccount", data.walletAddress);
    }
    return data;
  })();
  try {
    return await centralRefreshPromise;
  } finally {
    centralRefreshPromise = null;
  }
}

export async function revokeCentralIdentitySession(options?: {
  baseUrl?: string;
}): Promise<void> {
  const refreshToken = readCentralRefreshToken();
  if (!refreshToken) return;
  try {
    const response = await desktopAwareFetch(
      buildApiUrl("/api/v1/public/identity/session/revoke", options?.baseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          refreshToken,
          appId: getCentralAppId(),
          redirectUri: (() => {
            const configured =
              getClientConfig()?.centralUcanRedirectUri?.trim();
            if (configured) return configured;
            if (typeof window !== "undefined") {
              return `${window.location.origin}/central-ucan-callback.html`;
            }
            return "";
          })(),
        }),
      },
    );
    if (!response.ok) {
      console.warn(
        "[Central Auth] failed to revoke refresh session",
        response.status,
      );
    }
  } catch (error) {
    console.warn("[Central Auth] failed to revoke refresh session", error);
  } finally {
    clearCentralRefreshToken();
  }
}

async function issueCentralUcanByAudience(input: {
  audience: string;
  capabilities?: UcanCapability[];
  baseUrl?: string;
}): Promise<CentralUcanTokenRecord> {
  const normalizedAudience = input.audience.trim();
  if (!normalizedAudience) {
    throw new Error("Missing audience");
  }
  const normalizedCapabilities = normalizeUcanCapabilities(
    input.capabilities || [],
    { includeLegacyAliases: false },
  ) as UcanCapability[];

  const invokeIssue = async (sessionToken: string) => {
    const response = await desktopAwareFetch(
      buildApiUrl("/api/v1/public/auth/central/issue", input.baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          audience: normalizedAudience,
          capabilities: normalizedCapabilities,
        }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      const message = parseApiErrorText(
        text,
        `中心化签发 UCAN 失败: ${response.status}`,
      );
      throw createHttpError(message, response.status);
    }
    const data = parseEnvelope<CentralIssueResult>(
      text,
      "中心化签发 UCAN 失败",
    );
    const token = String(data.ucan || "").trim();
    if (!token) {
      throw new Error("中心化签发 UCAN 返回为空");
    }
    const payload = decodeJwtPayload(token);
    const audience = String(
      data.audience || payload?.aud || normalizedAudience,
    ).trim();
    const capabilities = normalizeUcanCapabilities(
      (data.capabilities && data.capabilities.length
        ? data.capabilities
        : normalizedCapabilities.length
          ? normalizedCapabilities
          : normalizeCapabilities(payload?.cap)) || [],
      {
        includeLegacyAliases: false,
      },
    ) as UcanCapability[];
    const expiresAt =
      normalizeEpochMs(data.expiresAt ?? data.exp) ||
      parseTokenExpiry(token) ||
      null;
    const notBefore =
      normalizeEpochMs(data.notBefore ?? data.nbf) ??
      normalizeEpochMs(payload?.nbf);
    const issuedAt =
      normalizeEpochMs(data.issuedAt ?? data.iat) ||
      normalizeEpochMs(payload?.iat) ||
      Date.now();
    if (!audience) {
      throw new Error("中心化签发 UCAN 缺少 audience");
    }
    if (!expiresAt) {
      throw new Error("中心化签发 UCAN 缺少过期时间");
    }
    const record: CentralUcanTokenRecord = {
      token,
      audience,
      capabilities,
      capsKey: buildCapsKey(capabilities),
      expiresAt,
      notBefore,
      issuedAt,
    };
    persistCentralUcanToken(record);
    persistLegacyToken(token, expiresAt);
    return record;
  };

  const sessionToken = await requestCentralIssueSession({
    baseUrl: input.baseUrl,
  });
  try {
    return await invokeIssue(sessionToken);
  } catch (error) {
    const status = (error as HttpError)?.status;
    if (status !== 401) {
      throw error;
    }
    clearCentralSessionTokenCache();
    const refreshedSessionToken = await requestCentralIssueSession({
      baseUrl: input.baseUrl,
    });
    return await invokeIssue(refreshedSessionToken);
  }
}

function parseEnvelope<T>(payload: string, fallbackMessage: string): T {
  if (!payload) {
    throw new Error(fallbackMessage);
  }
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(payload) as Envelope<T>;
  } catch {
    throw new Error(payload);
  }
  if (parsed.code !== 0) {
    throw new Error(parsed.message || fallbackMessage);
  }
  return parsed.data;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function resolveCentralAuthBaseUrl(baseUrlOverride?: string): string {
  const fromOverride = normalizeBaseUrl(baseUrlOverride || "");
  if (fromOverride) return fromOverride;
  const config = getClientConfig();
  const fromConfig = normalizeBaseUrl(config?.centralUcanAuthBaseUrl || "");
  if (fromConfig) return fromConfig;
  const fallback = normalizeBaseUrl(config?.routerBackendUrl || "");
  return fallback || "http://localhost:8100";
}

function buildApiUrl(path: string, baseUrlOverride?: string) {
  const base = resolveCentralAuthBaseUrl(baseUrlOverride);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getCentralAppId() {
  const config = getClientConfig();
  return config?.chatApplicationUid?.trim() || "";
}

function resolveCentralAppId(appId?: string) {
  const resolved = (appId || getCentralAppId()).trim();
  if (!resolved) {
    throw new Error("未配置 CHAT_APPLICATION_UID");
  }
  return resolved;
}

export function getUcanAuthMode(): UcanAuthMode {
  if (typeof localStorage === "undefined") return UCAN_AUTH_MODE_WALLET;
  const value = (localStorage.getItem(UCAN_AUTH_MODE_KEY) || "").trim();
  if (value === UCAN_AUTH_MODE_CENTRAL) {
    return UCAN_AUTH_MODE_CENTRAL;
  }
  return UCAN_AUTH_MODE_WALLET;
}

export function setUcanAuthMode(
  mode: UcanAuthMode,
  options?: { emit?: boolean },
) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(UCAN_AUTH_MODE_KEY, mode);
  }
  if (options?.emit !== false) {
    emitAuthChange();
  }
}

export function isCentralModeEnabled() {
  return getUcanAuthMode() === UCAN_AUTH_MODE_CENTRAL;
}

export function clearCentralUcanAuth(options?: {
  preserveMode?: boolean;
  emit?: boolean;
}) {
  centralIssuePromises.clear();
  clearCentralSessionTokenCache();
  centralRefreshPromise = null;
  if (typeof localStorage !== "undefined") {
    clearLegacyUcanToken();
    clearCentralUcanTokenStore();
    localStorage.removeItem(CENTRAL_ACCESS_TOKEN_KEY);
    localStorage.removeItem(CENTRAL_ACCESS_EXPIRES_AT_KEY);
    localStorage.removeItem(CENTRAL_SUBJECT_KEY);
    localStorage.removeItem(CENTRAL_IDENTITY_DID_KEY);
    localStorage.removeItem(CENTRAL_WALLET_ADDRESS_KEY);
    localStorage.removeItem(CENTRAL_IDENTITY_CREDENTIALS_KEY);
    clearCentralRefreshToken();
    localStorage.removeItem(CURRENT_IDENTITY_DID_KEY);
    localStorage.removeItem(CURRENT_WALLET_ADDRESS_KEY);
    if (!options?.preserveMode) {
      localStorage.removeItem(UCAN_AUTH_MODE_KEY);
    }
  }
  if (options?.emit !== false) {
    emitAuthChange();
  }
}

export function getCentralAccount(): string {
  if (typeof localStorage === "undefined") return "";
  return (
    localStorage.getItem(CENTRAL_WALLET_ADDRESS_KEY) ||
    localStorage.getItem(CENTRAL_IDENTITY_DID_KEY) ||
    localStorage.getItem(CENTRAL_SUBJECT_KEY) ||
    ""
  ).trim();
}

/**
 * The identity DID is the workspace owner for the centralized flow. The
 * linked wallet address remains available through getCentralWalletAddress()
 * for compatibility with wallet-facing UI and APIs, but it must not be used
 * as the login/workspace key.
 */
export function getCentralIdentityOwner(): string {
  if (typeof localStorage === "undefined") return "";
  return (
    localStorage.getItem(CURRENT_IDENTITY_DID_KEY) ||
    localStorage.getItem(CENTRAL_IDENTITY_DID_KEY) ||
    ""
  ).trim();
}

export function getCentralIdentityDid(): string {
  if (typeof localStorage === "undefined") return "";
  return (localStorage.getItem(CENTRAL_IDENTITY_DID_KEY) || "").trim();
}

export function getCentralWalletAddress(): string {
  if (typeof localStorage === "undefined") return "";
  return (localStorage.getItem(CENTRAL_WALLET_ADDRESS_KEY) || "").trim();
}

export function getCentralUcanToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const legacyToken = (
    localStorage.getItem(CENTRAL_UCAN_TOKEN_KEY) || ""
  ).trim();
  if (legacyToken) {
    const storedExpiresAt = parseStoredExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY);
    const payload = decodeJwtPayload(legacyToken);
    const tokenExp = parseTokenExpiry(legacyToken);
    const expiresAt = storedExpiresAt || tokenExp;
    const notBefore = normalizeEpochMs(payload?.nbf);
    if (isTokenValid(legacyToken, expiresAt, notBefore)) {
      if (!storedExpiresAt && tokenExp) {
        storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, tokenExp);
      }
      return legacyToken;
    }
    clearLegacyUcanToken();
  }

  const latest = getLatestValidCentralUcanTokenRecord();
  if (!latest) {
    return null;
  }
  persistLegacyToken(latest.token, latest.expiresAt);
  return latest.token;
}

export function getCentralAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = (localStorage.getItem(CENTRAL_ACCESS_TOKEN_KEY) || "").trim();
  if (!token) return null;
  const storedExpiresAt = parseStoredExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY);
  const payload = decodeJwtPayload(token);
  const tokenExp = parseTokenExpiry(token);
  const expiresAt = storedExpiresAt || tokenExp;
  const notBefore = normalizeEpochMs(payload?.nbf);
  if (!isTokenValid(token, expiresAt, notBefore)) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CENTRAL_ACCESS_TOKEN_KEY);
      localStorage.removeItem(CENTRAL_ACCESS_EXPIRES_AT_KEY);
    }
    return null;
  }
  if (!storedExpiresAt && tokenExp) {
    storeExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY, tokenExp);
  }
  return token;
}

export function isCentralUcanAuthorized(): boolean {
  if (!isCentralModeEnabled()) return false;
  const accessToken = getCentralAccessToken();
  if (accessToken && getCentralAccount()) return true;

  // A Passkey/Wallet identity exchange does not return the legacy access JWT.
  // It returns a short-lived UCAN issuing session instead. Do not report the
  // account as authorized when both that session and all issued UCANs are
  // gone; doing so only defers the failure to the first sync request and
  // leaves the user stuck on the generic workspace error screen.
  if (!getCentralIdentityDid()) return false;
  return Boolean(
    readCentralRefreshToken() ||
    readSessionTokenFromStorage() ||
    getCentralUcanToken(),
  );
}

export function getCentralUcanAuthorizationHeader(): string | null {
  if (!isCentralModeEnabled()) return null;
  const token = getCentralUcanToken();
  if (!token) return null;
  return `Bearer ${token}`;
}

export async function getCentralUcanAuthorizationHeaderForAudience(input: {
  audience?: string | null;
  capabilities?: UcanCapability[];
  baseUrl?: string;
}): Promise<string | null> {
  if (!isCentralModeEnabled()) return null;
  const audience = String(input.audience || "").trim();
  if (!audience) {
    return getCentralUcanAuthorizationHeader();
  }
  const capabilities = normalizeUcanCapabilities(input.capabilities || [], {
    includeLegacyAliases: false,
  }) as UcanCapability[];
  const cached = getMatchingCentralUcanTokenRecord(audience, capabilities);
  if (cached) {
    persistLegacyToken(cached.token, cached.expiresAt);
    return `Bearer ${cached.token}`;
  }

  const cacheKey = buildAudienceCapsCacheKey(audience, capabilities);
  const inFlight = centralIssuePromises.get(cacheKey);
  if (inFlight) {
    const record = await inFlight;
    return `Bearer ${record.token}`;
  }

  const promise = issueCentralUcanByAudience({
    audience,
    capabilities,
    baseUrl: input.baseUrl,
  });
  centralIssuePromises.set(cacheKey, promise);
  try {
    const record = await promise;
    return `Bearer ${record.token}`;
  } finally {
    centralIssuePromises.delete(cacheKey);
  }
}

export function getCentralUcanExpiresAt(): number | null {
  const stored = parseStoredExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY);
  if (stored) return stored;
  const latest = getLatestValidCentralUcanTokenRecord();
  if (latest?.expiresAt) {
    storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, latest.expiresAt);
    return latest.expiresAt;
  }
  const token = getCentralUcanToken();
  if (!token) return null;
  const exp = parseTokenExpiry(token);
  if (!exp) return null;
  storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, exp);
  return exp;
}

export async function createCentralAuthorizeRequest(input: {
  appId?: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256";
  scopes?: string[];
  appName?: string;
  baseUrl?: string;
}): Promise<CentralAuthorizeRequestResult> {
  const resolvedAppId = resolveCentralAppId(input.appId);
  const response = await desktopAwareFetch(
    buildApiUrl("/api/v1/public/identity/authorize/request", input.baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        appId: resolvedAppId,
        redirectUri: input.redirectUri,
        state: input.state || undefined,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod || "S256",
        scopes: input.scopes || [
          "identity.basic",
          "identity.wallet",
          "identity.username",
        ],
        appName: input.appName || undefined,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = `创建中心化授权请求失败: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as Envelope<unknown>;
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return parseEnvelope<CentralAuthorizeRequestResult>(
    text,
    "创建钱包身份授权请求失败",
  );
}

export async function approveCentralAuthorizePresentation(input: {
  requestId: string;
  presentation: unknown;
  baseUrl?: string;
}): Promise<CentralAuthorizeApprovalResult> {
  const response = await desktopAwareFetch(
    buildApiUrl("/api/v1/public/identity/authorize/approve", input.baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        requestId: input.requestId,
        presentation: input.presentation,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      parseApiErrorText(text, `钱包身份授权确认失败: ${response.status}`),
    );
  }
  return parseEnvelope<CentralAuthorizeApprovalResult>(
    text,
    "钱包身份授权确认失败",
  );
}

export async function exchangeCentralAuthorizeCode(input: {
  code: string;
  appId?: string;
  redirectUri: string;
  codeVerifier: string;
  baseUrl?: string;
}): Promise<CentralAuthorizeExchangeResult> {
  const resolvedAppId = resolveCentralAppId(input.appId);
  const response = await desktopAwareFetch(
    buildApiUrl("/api/v1/public/identity/authorize/exchange", input.baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        code: input.code,
        appId: resolvedAppId,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier,
        issueUcanSession: true,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = `中心化授权码兑换失败: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as Envelope<unknown>;
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return parseEnvelope<CentralAuthorizeExchangeResult>(
    text,
    "中心化授权码兑换失败",
  );
}

export function applyCentralAuthorizeExchange(
  result: CentralAuthorizeExchangeResult,
  options?: { emit?: boolean },
) {
  centralIssuePromises.clear();
  clearCentralSessionTokenCache();
  if (typeof localStorage !== "undefined") {
    const did = String(result.did || "").trim();
    const walletAddress = String(result.walletAddress || "").trim();
    if (did) {
      localStorage.setItem(CENTRAL_IDENTITY_DID_KEY, did);
      localStorage.setItem(CURRENT_IDENTITY_DID_KEY, did);
      localStorage.removeItem(CENTRAL_SUBJECT_KEY);
    }
    if (walletAddress) {
      localStorage.setItem(CENTRAL_WALLET_ADDRESS_KEY, walletAddress);
      localStorage.setItem(CURRENT_WALLET_ADDRESS_KEY, walletAddress);
      localStorage.setItem("currentAccount", walletAddress);
    } else {
      // Never retain an address from a previous account when the identity
      // service intentionally returns a DID-only result.
      localStorage.removeItem(CENTRAL_WALLET_ADDRESS_KEY);
      localStorage.removeItem(CURRENT_WALLET_ADDRESS_KEY);
      localStorage.removeItem("currentAccount");
    }
    if (result.credentials) {
      localStorage.setItem(
        CENTRAL_IDENTITY_CREDENTIALS_KEY,
        JSON.stringify(result.credentials),
      );
    }
    const sessionToken = String(result.ucanSession?.sessionToken || "").trim();
    if (sessionToken) {
      persistSessionToken(sessionToken, result.ucanSession?.expiresAt);
    }
    const refreshToken = String(result.refreshToken || "").trim();
    if (refreshToken) {
      persistCentralRefreshToken(refreshToken, result.refreshExpiresAt);
    } else {
      clearCentralRefreshToken();
    }
    if (result.token) {
      localStorage.setItem(CENTRAL_ACCESS_TOKEN_KEY, result.token);
      storeExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY, result.expiresAt);
    } else {
      localStorage.removeItem(CENTRAL_ACCESS_TOKEN_KEY);
      localStorage.removeItem(CENTRAL_ACCESS_EXPIRES_AT_KEY);
    }
    if (result.ucan && result.audience) {
      persistLegacyToken(result.ucan, result.ucanExpiresAt);
      persistCentralUcanToken({
        token: result.ucan,
        audience: result.audience,
        capabilities: normalizeUcanCapabilities(result.capabilities || [], {
          includeLegacyAliases: false,
        }) as UcanCapability[],
        capsKey: buildCapsKey(result.capabilities || []),
        expiresAt:
          normalizeEpochMs(result.ucanExpiresAt) ||
          parseTokenExpiry(result.ucan) ||
          Date.now(),
        notBefore: normalizeEpochMs(result.notBefore),
        issuedAt: normalizeEpochMs(result.issuedAt) || Date.now(),
      });
    } else {
      clearLegacyUcanToken();
      clearCentralUcanTokenStore();
    }
  }
  setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
  if (options?.emit !== false) {
    emitAuthChange();
  }
}
