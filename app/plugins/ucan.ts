import { getClientConfig } from "@/app/config/client";
import type { UcanCapability } from "@yeying-community/web3-bs";

export const UCAN_SESSION_ID = "default";

const DEFAULT_UCAN_RESOURCE = "profile";
const DEFAULT_UCAN_ACTION = "read";
const DEFAULT_WEBDAV_RESOURCE = "";
const DEFAULT_WEBDAV_ACTION = "";
const DEFAULT_WEBDAV_APP_ACTION = "write";

const DEFAULT_CAPABILITIES: UcanCapability[] = [
  { resource: DEFAULT_UCAN_RESOURCE, action: DEFAULT_UCAN_ACTION },
];

function buildCapsKey(caps: UcanCapability[]): string {
  return (caps || [])
    .map((cap) => `${cap.resource}:${cap.action}`)
    .sort()
    .join("|");
}

function uniqCapabilities(caps: UcanCapability[]): UcanCapability[] {
  const seen = new Map<string, UcanCapability>();
  for (const cap of caps) {
    const key = `${cap.resource}:${cap.action}`;
    if (!seen.has(key)) {
      seen.set(key, cap);
    }
  }
  return Array.from(seen.values());
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

function sanitizeAppId(appId: string): string {
  return appId.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function getWebdavAppId(): string {
  const host = typeof window !== "undefined" ? window.location.host || "" : "";
  return host ? sanitizeAppId(host) : "";
}

export function getWebdavAppAction(): string {
  return DEFAULT_WEBDAV_APP_ACTION || "write";
}

export function getWebdavCapabilities(): UcanCapability[] {
  if (DEFAULT_WEBDAV_RESOURCE && DEFAULT_WEBDAV_ACTION) {
    return [
      { resource: DEFAULT_WEBDAV_RESOURCE, action: DEFAULT_WEBDAV_ACTION },
    ];
  }
  const appId = getWebdavAppId();
  if (appId) {
    return [{ resource: `app:${appId}`, action: getWebdavAppAction() }];
  }
  return DEFAULT_CAPABILITIES;
}

export function getRouterCapabilities(): UcanCapability[] {
  return DEFAULT_CAPABILITIES;
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
  const envAud = process.env.NEXT_PUBLIC_WEBDAV_UCAN_AUD?.trim();
  if (envAud) return envAud;
  const resolvedBackendUrl = backendUrl ?? getBackendUrl("webdav");
  return toDidWeb(resolvedBackendUrl ?? undefined);
}

export function getRouterAudience(): string | null {
  const envAud = process.env.NEXT_PUBLIC_ROUTER_UCAN_AUD?.trim();
  return envAud || toDidWeb(getBackendUrl("router"));
}
