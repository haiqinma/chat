import { getClientConfig } from "../config/client";
import {
  COMMUNITY_MARKETPLACE_TOOL_PACKAGES_RAW_URL,
  COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
  COMMUNITY_MARKETPLACE_SKILL_PACKAGES_RAW_URL,
  COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
  LOCAL_MARKETPLACE_TOOL_PACKAGES_URL,
  LOCAL_MARKETPLACE_SKILL_PACKAGES_URL,
} from "../constant";

type MarketplaceSourceKind = "skill" | "tool";

export type MarketplaceLoadResult<T> = {
  data: T;
  url: string;
  fallbackUsed: boolean;
  failedSources: { url: string; error: string }[];
};

function uniqueUrls(urls: (string | undefined)[]) {
  const seen = new Set<string>();
  return urls
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function getConfiguredSource(kind: MarketplaceSourceKind) {
  const config = getClientConfig();
  return kind === "skill"
    ? config?.marketplaceSkillPackagesUrl
    : config?.marketplaceToolPackagesUrl;
}

export function getMarketplaceSourceUrls(kind: MarketplaceSourceKind) {
  if (kind === "skill") {
    return uniqueUrls([
      getConfiguredSource(kind),
      COMMUNITY_MARKETPLACE_SKILL_PACKAGES_RAW_URL,
      COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL,
      LOCAL_MARKETPLACE_SKILL_PACKAGES_URL,
    ]);
  }

  return uniqueUrls([
    getConfiguredSource(kind),
    COMMUNITY_MARKETPLACE_TOOL_PACKAGES_RAW_URL,
    COMMUNITY_MARKETPLACE_TOOL_PACKAGES_URL,
    LOCAL_MARKETPLACE_TOOL_PACKAGES_URL,
  ]);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJson<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchMarketplaceJson<T>(
  kind: MarketplaceSourceKind,
  signal?: AbortSignal,
): Promise<MarketplaceLoadResult<T>> {
  const urls = getMarketplaceSourceUrls(kind);
  const failedSources: MarketplaceLoadResult<T>["failedSources"] = [];

  for (const url of urls) {
    try {
      const data = await fetchJson<T>(url, signal);
      return {
        data,
        url,
        fallbackUsed: failedSources.length > 0,
        failedSources,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      failedSources.push({
        url,
        error: getErrorMessage(error),
      });
    }
  }

  throw new Error(
    failedSources.map((source) => `${source.url}: ${source.error}`).join("; "),
  );
}
