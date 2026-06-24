import {
  COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
  COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
  DEFAULT_INPUT_TEMPLATE,
} from "../constant";
import { getBuildConfig, type BuildConfig } from "./build";
import { getServerSideConfig } from "./server";

export type UcanLoginForceMode = "auto" | "wallet" | "central";

function normalizeUcanLoginForceMode(raw?: string): UcanLoginForceMode {
  const mode = (raw || "").trim().toLowerCase();
  if (mode === "wallet" || mode === "central") {
    return mode;
  }
  return "auto";
}

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
  disableGPT4: boolean;
  hideBalanceQuery: boolean;
  disableFastLink: boolean;
  customModels: string;
  defaultModel: string;
  visionModels: string;
  enableTools: boolean;
  routerBackendUrl: string;
  webdavBackendBaseUrl: string;
  webdavBackendPrefix: string;
  webdavBackendUrl: string;
  centralUcanAuthBaseUrl: string;
  centralUcanAppId: string;
  ucanLoginForceMode: UcanLoginForceMode;
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
  const defaultRouterBackendUrl = "http://127.0.0.1:3011";

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
    process.env.ROUTER_BACKEND_URL?.trim() || defaultRouterBackendUrl,
  );

  return {
    ...buildConfig,
    template: process.env.DEFAULT_INPUT_TEMPLATE ?? DEFAULT_INPUT_TEMPLATE,
    needCode: serverConfig.needCode,
    hideUserApiKey: serverConfig.hideUserApiKey,
    disableGPT4: serverConfig.disableGPT4,
    hideBalanceQuery: serverConfig.hideBalanceQuery,
    disableFastLink: serverConfig.disableFastLink,
    customModels: serverConfig.customModels,
    defaultModel: serverConfig.defaultModel,
    visionModels: serverConfig.visionModels,
    enableTools: serverConfig.enableTools,
    routerBackendUrl,
    webdavBackendBaseUrl,
    webdavBackendPrefix,
    webdavBackendUrl: joinBasePrefix(webdavBackendBaseUrl, webdavBackendPrefix),
    centralUcanAuthBaseUrl:
      process.env.CENTRAL_UCAN_AUTH_BASE_URL?.trim() || "http://127.0.0.1:8100",
    centralUcanAppId: process.env.CENTRAL_UCAN_APP_ID?.trim() || "",
    ucanLoginForceMode: normalizeUcanLoginForceMode(
      process.env.UCAN_LOGIN_FORCE_MODE,
    ),
    marketplaceSkillPackagesUrl:
      process.env.MARKETPLACE_SKILL_PACKAGES_URL?.trim() ||
      COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
    marketplaceToolPackagesUrl:
      process.env.MARKETPLACE_TOOL_PACKAGES_URL?.trim() ||
      COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
  };
}
