import { getClientConfig } from "@/app/config/client";
import type { UcanCapability } from "@yeying-community/web3-bs";

export const UCAN_SESSION_ID = "default";

const DEFAULT_UCAN_RESOURCE =
  process.env.NEXT_PUBLIC_UCAN_RESOURCE?.trim() || "profile";
const DEFAULT_UCAN_ACTION =
  process.env.NEXT_PUBLIC_UCAN_ACTION?.trim() || "read";

const DEFAULT_CAPABILITIES: UcanCapability[] = [
  { resource: DEFAULT_UCAN_RESOURCE, action: DEFAULT_UCAN_ACTION },
];

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
  return kind === "router"
    ? config.routerBackendUrl ?? null
    : config.webdavBackendUrl ?? null;
}

export function getWebdavCapabilities(): UcanCapability[] {
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

export function getWebdavAudience(): string | null {
  const envAud = process.env.NEXT_PUBLIC_WEBDAV_UCAN_AUD?.trim();
  return envAud || toDidWeb(getBackendUrl("webdav"));
}

export function getRouterAudience(): string | null {
  const envAud = process.env.NEXT_PUBLIC_ROUTER_UCAN_AUD?.trim();
  return envAud || toDidWeb(getBackendUrl("router"));
}
