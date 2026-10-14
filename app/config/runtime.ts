import {
  COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
  COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
  DEFAULT_INPUT_TEMPLATE,
} from "../constant";
import { getBuildConfig, type BuildConfig } from "./build";
import { getServerSideConfig } from "./server";

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

function splitWebdavUrl(raw: string): { baseUrl: string; prefix: string } {
  try {
    const url = new URL(raw);
    const baseUrl = `${url.protocol}//${url.host}`;
    const pathname = url.pathname.replace(/\/+$/, "");
    return { baseUrl, prefix: pathname === "/" ? "" : pathname };
  } catch {
    return { baseUrl: raw.trim(), prefix: "" };
  }
}

function joinBasePrefix(baseUrl: string, prefix: string): string {
  if (!baseUrl) return "";
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPrefix = normalizePrefix(prefix);
  return normalizedPrefix
    ? `${normalizedBase}${normalizedPrefix}`
    : normalizedBase;
}

export type RuntimePublicConfig = BuildConfig & {
  template: string;
  needCode: boolean;
  hideUserApiKey: boolean;
  hideBalanceQuery: boolean;
  disableFastLink: boolean;
  defaultModel: string;
  summarizeModel: string;
  visionModels: string;
  enableTools: boolean;
  routerBackendUrl: string;
  routerPortalUrl: string;
  routerPortalTokenUrl: string;
  routerPortalRechargeUrl: string;
  webdavBackendBaseUrl: string;
  webdavBackendPrefix: string;
  webdavBackendUrl: string;
  chatApplicationUid: string;
  centralUcanAuthBaseUrl: string;
  centralUcanRedirectUri: string;
  marketplaceSkillPackagesUrl: string;
  marketplaceToolPackagesUrl: string;
};

export function getRuntimePublicConfig(): RuntimePublicConfig {
  if (typeof process === "undefined") {
    throw Error(
      "[Runtime Config] you are importing a nodejs-only module outside of nodejs",
    );
  }

  const buildConfig = getBuildConfig();
  const serverConfig = getServerSideConfig();

  const webdavBackendBaseUrlEnv =
    process.env.WEBDAV_BACKEND_BASE_URL?.trim() || "";
  const rawWebdavBackendPrefixEnv = process.env.WEBDAV_BACKEND_PREFIX;
  const hasWebdavBackendPrefixEnv = rawWebdavBackendPrefixEnv !== undefined;
  const webdavBackendPrefixEnv = hasWebdavBackendPrefixEnv
    ? rawWebdavBackendPrefixEnv.trim()
    : "";

  let webdavBackendBaseUrl = webdavBackendBaseUrlEnv;
  let webdavBackendPrefix = webdavBackendPrefixEnv;
  if (webdavBackendBaseUrl) {
    const parsed = splitWebdavUrl(webdavBackendBaseUrl);
    webdavBackendBaseUrl = parsed.baseUrl;
    if (!webdavBackendPrefix && parsed.prefix) {
      webdavBackendPrefix = parsed.prefix;
    }
  }
  if (!hasWebdavBackendPrefixEnv && !webdavBackendPrefix) {
    webdavBackendPrefix = "/dav";
  }

  webdavBackendBaseUrl = webdavBackendBaseUrl
    ? normalizeBaseUrl(webdavBackendBaseUrl)
    : "";
  webdavBackendPrefix = webdavBackendPrefix
    ? normalizePrefix(webdavBackendPrefix)
    : "";

  const routerBackendUrl = normalizeBaseUrl(
    process.env.ROUTER_BACKEND_URL?.trim() || "",
  );
  const routerPortalUrl = normalizeBaseUrl(
    process.env.ROUTER_PORTAL_URL?.trim() || "",
  );
  const routerPortalTokenUrl = normalizeBaseUrl(
    process.env.ROUTER_PORTAL_TOKEN_URL?.trim() || routerPortalUrl,
  );
  const routerPortalRechargeUrl = normalizeBaseUrl(
    process.env.ROUTER_PORTAL_RECHARGE_URL?.trim() || routerPortalTokenUrl,
  );

  const chatApplicationUid = process.env.CHAT_APPLICATION_UID?.trim() || "";

  return {
    ...buildConfig,
    template: process.env.DEFAULT_INPUT_TEMPLATE ?? DEFAULT_INPUT_TEMPLATE,
    needCode: serverConfig.needCode,
    hideUserApiKey: serverConfig.hideUserApiKey,
    hideBalanceQuery: serverConfig.hideBalanceQuery,
    disableFastLink: serverConfig.disableFastLink,
    defaultModel: serverConfig.defaultModel,
    summarizeModel: serverConfig.summarizeModel,
    visionModels: serverConfig.visionModels,
    enableTools: serverConfig.enableTools,
    routerBackendUrl,
    routerPortalUrl,
    routerPortalTokenUrl,
    routerPortalRechargeUrl,
    webdavBackendBaseUrl,
    webdavBackendPrefix,
    webdavBackendUrl: joinBasePrefix(webdavBackendBaseUrl, webdavBackendPrefix),
    chatApplicationUid,
    centralUcanAuthBaseUrl:
      process.env.CENTRAL_UCAN_AUTH_BASE_URL?.trim() || "http://localhost:8100",
    centralUcanRedirectUri: process.env.CENTRAL_UCAN_REDIRECT_URI?.trim() || "",
    marketplaceSkillPackagesUrl:
      process.env.MARKETPLACE_SKILL_PACKAGES_URL?.trim() ||
      COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
    marketplaceToolPackagesUrl:
      process.env.MARKETPLACE_TOOL_PACKAGES_URL?.trim() ||
      COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
  };
}
