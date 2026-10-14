import { getClientConfig } from "../config/client";

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getRouterPortalUrl() {
  return getClientConfig()?.routerPortalUrl || "";
}

export function getRouterPortalPricingUrl() {
  return `${normalizeUrl(getRouterPortalUrl())}/workspace/service/pricing`;
}
