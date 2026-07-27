import { getClientConfig } from "@/app/config/client";
import {
  deriveAppIdFromLocation,
  getCapabilityAction,
  getCapabilityResource,
  normalizeUcanCapabilities,
  type UcanCapability,
} from "@yeying-community/web3-bs";

export const UCAN_SESSION_ID = "default";

const APP_UCAN_RESOURCE_PREFIX = "app:all:";
const DEFAULT_APP_ID = "localhost";
const ROUTER_UCAN_ACTION = "invoke";
const DEFAULT_WEBDAV_RESOURCE = "";
const DEFAULT_WEBDAV_ACTION = "";
const DEFAULT_WEBDAV_APP_ACTION = "write";

function buildCapability(resource: string, action: string): UcanCapability {
  return {
    with: resource,
    can: action,
    resource,
    action,
  };
}

function normalizeCaps(caps: UcanCapability[]): UcanCapability[] {
  return normalizeUcanCapabilities(caps || []);
}

function buildCapsKey(caps: UcanCapability[]): string {
  return normalizeUcanCapabilities(caps || [], { includeLegacyAliases: false })
    .map((cap) => {
      const resource = getCapabilityResource(cap);
      const action = getCapabilityAction(cap);
      return `${resource}:${action}`;
    })
    .filter((entry) => entry !== ":")
    .sort()
    .join("|");
}

function uniqCapabilities(caps: UcanCapability[]): UcanCapability[] {
  return normalizeCaps(caps);
}

function toDidWeb(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return `did:web:${url.host}`;
  } catch {
    return null;
  }
}

function getBackendUrl(kind: "router" | "webdav"): string | null {
  const config = getClientConfig();
  if (!config) return null;
  if (kind === "router") {
    return config.routerBackendUrl ?? null;
  }
  return config.webdavBackendBaseUrl ?? null;
}

function getBackendHost(kind: "router" | "webdav"): string | null {
  const backendUrl = getBackendUrl(kind);
  if (!backendUrl) return null;
  try {
    const host = new URL(backendUrl).host.trim();
    return host || null;
  } catch {
    return null;
  }
}

function sanitizeAppId(appId: string): string {
  return appId.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getAppCapabilityResource(appId?: string | null): string {
  const normalized = appId ? sanitizeAppId(appId) : "";
  if (normalized) {
    return `${APP_UCAN_RESOURCE_PREFIX}${normalized}`;
  }
  return `${APP_UCAN_RESOURCE_PREFIX}${DEFAULT_APP_ID}`;
}

function getWebdavCapabilityResource(): string {
  return getAppCapabilityResource(getWebdavAppId());
}

function getRouterCapabilityResource(): string {
  return getAppCapabilityResource(getWebdavAppId());
}

export function getWebdavAppId(): string {
  const configuredAppId = getClientConfig()?.webdavAppId?.trim();
  const appId = configuredAppId || deriveAppIdFromLocation();
  return appId ? sanitizeAppId(appId) : "";
}

export function getWebdavAppAction(): string {
  return DEFAULT_WEBDAV_APP_ACTION || "write";
}

export function getWebdavCapabilities(): UcanCapability[] {
  if (DEFAULT_WEBDAV_RESOURCE && DEFAULT_WEBDAV_ACTION) {
    return normalizeCaps([
      buildCapability(DEFAULT_WEBDAV_RESOURCE, DEFAULT_WEBDAV_ACTION),
    ]);
  }
  return normalizeCaps([
    buildCapability(getWebdavCapabilityResource(), getWebdavAppAction()),
  ]);
}

export function getRouterCapabilities(): UcanCapability[] {
  return normalizeCaps([
    buildCapability(getRouterCapabilityResource(), ROUTER_UCAN_ACTION),
  ]);
}

export function getUcanRootCapabilities(): UcanCapability[] {
  return uniqCapabilities([
    ...getWebdavCapabilities(),
    ...getRouterCapabilities(),
  ]);
}

export function getUcanRootCapsKey(): string {
  return buildCapsKey(getUcanRootCapabilities());
}

export function getUcanCapsKey(caps?: UcanCapability[] | null): string {
  return buildCapsKey(caps || []);
}

export function getWebdavAudience(backendUrl?: string | null): string | null {
  const resolvedBackendUrl = backendUrl ?? getBackendUrl("webdav");
  return toDidWeb(resolvedBackendUrl ?? undefined);
}

export function getRouterAudience(): string | null {
  return toDidWeb(getBackendUrl("router"));
}

export function getRouterServiceHost(): string | null {
  return getBackendHost("router");
}

export function getWebdavServiceHost(): string | null {
  return getBackendHost("webdav");
}

export function buildUcanRootStatement(options: {
  audience: string;
  capabilities: UcanCapability[];
  notBeforeMs?: number;
}): string {
  const capabilities = normalizeCaps(options.capabilities);
  const payload: Record<string, unknown> = {
    aud: options.audience,
    cap: capabilities,
    service_hosts: {
      router: getRouterServiceHost(),
      webdav: getWebdavServiceHost(),
    },
  };
  if (typeof options.notBeforeMs === "number") {
    payload.nbf = options.notBeforeMs;
  }
  return `UCAN-AUTH ${JSON.stringify(payload)}`;
}
