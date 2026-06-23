"use client";

import {
  ACCESS_CODE_PREFIX,
  ApiPath,
  OPENAI_BASE_URL,
  OpenaiPath,
  ServiceProvider,
} from "@/app/constant";
import { getClientConfig } from "@/app/config/client";
import { getCachedUcanSession } from "@/app/plugins/ucan-session";
import {
  getRouterAudience,
  getRouterCapabilities,
  UCAN_SESSION_ID,
} from "@/app/plugins/ucan";
import {
  getCentralUcanAuthorizationHeaderForAudience,
  isCentralModeEnabled,
} from "@/app/plugins/central-ucan";
import { useAccessStore } from "@/app/store";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { fetch } from "@/app/utils/stream";
import { authUcanFetch } from "@yeying-community/web3-bs";
import {
  ChatOptions,
  LLMApi,
  LLMModel,
  LLMUsage,
  normalizeSupportedEndpoints,
  SupportedTextEndpoint,
  SpeechOptions,
} from "../api";

type RouterModelCard = {
  id?: string;
  owned_by?: string;
  tags?: string[];
  specification?: LLMModel["specification"];
  supported_endpoints?: string[];
};

type RouterModelListResponse = {
  object?: string;
  data?: RouterModelCard[];
};

type RouterProviderModelDetail = {
  model?: string;
  type?: string;
  status?: string;
  description?: string;
  tags?: string[];
  specification?: LLMModel["specification"];
  supported_endpoints?: string[];
};

type RouterProviderModelsItem = {
  id?: string;
  name?: string;
  models?: RouterProviderModelDetail[];
  sort_order?: number;
};

type RouterProviderModelsResponse = {
  success?: boolean;
  data?: RouterProviderModelsItem[];
};

export type RouterPublicToken = {
  id?: string;
  key?: string;
  status?: number | string;
  name?: string;
  created_time?: number;
  updated_time?: number;
  expired_time?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
  remaining_amount?: number;
  used_amount?: number;
  models?: string | null;
};

type RouterPublicTokenListResponse = {
  success?: boolean;
  data?: RouterPublicToken[];
};

export type RouterTokenStatus = {
  object?: string;
  token_id?: string;
  token_name?: string;
  status?: number | string;
  unlimited_quota?: boolean;
  total_granted?: number;
  total_used?: number;
  total_available?: number;
  remaining_amount?: number;
  used_amount?: number;
  created_at?: number;
  updated_at?: number;
  accessed_at?: number;
  expires_at?: number;
};

type RouterTokenStatusResponse = {
  success?: boolean;
  message?: string;
  data?: RouterTokenStatus;
};

const ROUTER_HOST = "llm.yeying.pub";

const getRouterBackendHost = () => {
  try {
    const url = getClientConfig()?.routerBackendUrl;
    if (!url) return "";
    return new URL(url).host;
  } catch {
    return "";
  }
};

function isRouterUrl(url: string): boolean {
  try {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(url, base);
    return (
      parsed.host.includes(ROUTER_HOST) ||
      (getRouterBackendHost() !== "" && parsed.host === getRouterBackendHost())
    );
  } catch {
    return false;
  }
}

function getBaseRouterHeaders() {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const selectedToken = accessStore.selectedRouterToken?.trim();
  if (selectedToken) {
    headers["Authorization"] = `Bearer ${selectedToken}`;
    return headers;
  }

  const apiKey = accessStore.openaiApiKey.trim();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    return headers;
  }

  const accessCode = accessStore.accessCode.trim();
  if (accessStore.enabledAccessControl() && accessCode) {
    headers["Authorization"] = `Bearer ${ACCESS_CODE_PREFIX}${accessCode}`;
  }

  return headers;
}

async function fetchRouterTokensWithUcan(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const audience = getRouterAudience();
  const capabilities = getRouterCapabilities();

  if (isCentralModeEnabled()) {
    const authorization = await getCentralUcanAuthorizationHeaderForAudience({
      audience,
      capabilities,
    });
    if (!authorization) {
      throw new Error("UCAN authorization is not available");
    }
    return fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
        Authorization: authorization,
      },
    });
  }

  const issuer = await getCachedUcanSession();
  if (!issuer || !audience) {
    throw new Error("UCAN session is not available");
  }

  return authUcanFetch(
    url,
    {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    },
    {
      sessionId: UCAN_SESSION_ID,
      audience,
      capabilities,
      issuer,
    },
  );
}

function getHeadersForRouterModelAccess(url: string) {
  const headers = getBaseRouterHeaders();
  if (!isRouterUrl(url)) return headers;
  return headers;
}

function getRouterBackendBaseUrl() {
  const routerBackendUrl =
    getClientConfig()?.routerBackendUrl?.trim() || "http://127.0.0.1:3011";
  return routerBackendUrl.replace(/\/+$/, "");
}

function resolveProviderNameFromOwnedBy(
  ownedBy: string,
  modelName: string,
  supportedEndpoints: string[],
): ServiceProvider {
  const source = `${ownedBy} ${modelName}`.toLowerCase();
  const hasMessages = supportedEndpoints.includes(
    SupportedTextEndpoint.Messages,
  );
  const hasOpenAIText =
    supportedEndpoints.includes(SupportedTextEndpoint.Responses) ||
    supportedEndpoints.includes(SupportedTextEndpoint.ChatCompletions);

  if (hasMessages && !hasOpenAIText) {
    return ServiceProvider.Anthropic;
  }

  if (source.includes("anthropic") || source.includes("claude")) {
    return ServiceProvider.Anthropic;
  }
  if (
    source.includes("google") ||
    source.includes("gemini") ||
    source.includes("vertex")
  ) {
    return ServiceProvider.Google;
  }
  if (source.includes("deepseek")) {
    return ServiceProvider.DeepSeek;
  }
  if (source.includes("xai") || source.includes("grok")) {
    return ServiceProvider.XAI;
  }
  if (
    source.includes("zhipu") ||
    source.includes("chatglm") ||
    source.includes("bigmodel") ||
    source.includes("glm-")
  ) {
    return ServiceProvider.ChatGLM;
  }
  if (
    source.includes("bytedance") ||
    source.includes("doubao") ||
    source.includes("volc") ||
    source.includes("ark-")
  ) {
    return ServiceProvider.Volcengine;
  }
  if (
    source.includes("alibaba") ||
    source.includes("aliyun") ||
    source.includes("dashscope") ||
    source.includes("qwen")
  ) {
    return ServiceProvider.Alibaba;
  }
  if (source.includes("moonshot") || source.includes("kimi")) {
    return ServiceProvider.Moonshot;
  }
  if (source.includes("tencent") || source.includes("hunyuan")) {
    return ServiceProvider.Tencent;
  }
  if (source.includes("baidu") || source.includes("ernie")) {
    return ServiceProvider.Baidu;
  }
  if (
    source.includes("iflytek") ||
    source.includes("xunfei") ||
    source.includes("spark")
  ) {
    return ServiceProvider.Iflytek;
  }
  if (source.includes("siliconflow")) {
    return ServiceProvider.SiliconFlow;
  }
  if (source.includes("302.ai") || source.includes("302ai")) {
    return ServiceProvider["302.AI"];
  }
  if (hasMessages) {
    return ServiceProvider.Anthropic;
  }
  return ServiceProvider.OpenAI;
}

function providerId(providerName: ServiceProvider | string): string {
  const normalized = providerName.trim();
  switch (normalized) {
    case ServiceProvider["302.AI"]:
      return "302ai";
    default:
      return normalized.toLowerCase();
  }
}

function providerSort(providerName: ServiceProvider | string): number {
  switch (providerName.trim()) {
    case ServiceProvider.OpenAI:
      return 1;
    case ServiceProvider.Anthropic:
      return 2;
    case ServiceProvider.Google:
      return 3;
    case ServiceProvider.DeepSeek:
      return 4;
    case ServiceProvider.XAI:
      return 5;
    default:
      return 100;
  }
}

function modelNameFromProviderDetail(
  detail: RouterProviderModelDetail,
): string {
  return detail.model?.trim() || "";
}

function normalizeTags(tags?: readonly string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  tags.forEach((tag) => {
    const value = typeof tag === "string" ? tag.trim().toLowerCase() : "";
    if (!value || seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });
  return normalized;
}

function buildModelsFromProviderModels(
  items: RouterProviderModelsItem[],
): LLMModel[] {
  const seen = new Set<string>();
  const finalList: LLMModel[] = [];
  let seq = 1000;

  for (const item of items) {
    const providerID = item.id?.trim();
    if (!providerID) continue;
    const providerName = item.name?.trim() || providerID;
    const sorted =
      typeof item.sort_order === "number" && Number.isFinite(item.sort_order)
        ? item.sort_order
        : providerSort(providerName);

    for (const detail of item.models || []) {
      const name = modelNameFromProviderDetail(detail);
      if (!name) continue;
      const key = `${name}@${providerID}`;
      if (seen.has(key)) continue;
      seen.add(key);

      finalList.push({
        name,
        displayName: name,
        available: true,
        sorted: seq++,
        ownedBy: providerID,
        tags: normalizeTags(detail.tags),
        supportedEndpoints: normalizeSupportedEndpoints(
          detail.supported_endpoints,
        ),
        modelType: detail.type?.trim() || undefined,
        status: detail.status?.trim() || undefined,
        description: detail.description?.trim() || undefined,
        specification: detail.specification,
        provider: {
          id: providerID,
          providerName,
          providerType: providerID,
          sorted,
        },
      });
    }
  }

  return finalList;
}

export class RouterApi implements LLMApi {
  async chat(_options: ChatOptions): Promise<void> {
    throw new Error("RouterApi only supports models()");
  }

  async speech(_options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("RouterApi does not support speech()");
  }

  async usage(): Promise<LLMUsage> {
    return {
      used: 0,
      total: 0,
    };
  }

  async publicTokens(): Promise<RouterPublicToken[]> {
    const tokenListPath = `${getRouterBackendBaseUrl()}/api/v1/public/token/`;

    try {
      const res = await fetchRouterTokensWithUcan(`${tokenListPath}?page=1`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error(`[Router Tokens] failed to fetch: ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const bodyPreview = (await res.text()).slice(0, 120);
        throw new Error(
          `[Router Tokens] expected JSON but got ${contentType || "unknown"}: ${bodyPreview}`,
        );
      }

      const resJson = (await res.json()) as RouterPublicTokenListResponse;
      return Array.isArray(resJson.data) ? resJson.data : [];
    } catch (error) {
      console.warn("[Router Tokens] failed to fetch", error);
      return [];
    }
  }

  async publicTokenStatus(): Promise<RouterTokenStatus | null> {
    const statusPath = `${getRouterBackendBaseUrl()}/api/v1/public/token/status`;

    try {
      const headers = getHeadersForRouterModelAccess(statusPath);
      if (!headers.Authorization) {
        return null;
      }

      const res = await fetch(statusPath, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        throw new Error(`[Router Token Status] failed to fetch: ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const bodyPreview = (await res.text()).slice(0, 120);
        throw new Error(
          `[Router Token Status] expected JSON but got ${contentType || "unknown"}: ${bodyPreview}`,
        );
      }

      const resJson = (await res.json()) as RouterTokenStatusResponse;
      return resJson.success && resJson.data ? resJson.data : null;
    } catch (error) {
      console.warn("[Router Token Status] failed to fetch", error);
      return null;
    }
  }

  private path(path: string): string {
    const accessStore = useAccessStore.getState();
    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? OPENAI_BASE_URL : ApiPath.OpenAI;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.OpenAI)) {
      baseUrl = "https://" + baseUrl;
    }

    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  // Provider models are broader than the runtime-available model list.
  // They are intended for mask candidate selection, not chat session selection.
  async providerModels(): Promise<LLMModel[]> {
    const providerModelsPath = this.path(OpenaiPath.ProviderModelsPath);
    const accessStore = useAccessStore.getState();
    const hasAccessCode =
      accessStore.enabledAccessControl() &&
      accessStore.accessCode.trim() !== "";
    const hasApiKey = accessStore.openaiApiKey.trim() !== "";
    const hasSelectedToken = accessStore.selectedRouterToken.trim() !== "";
    const shouldSkipRouterFetch =
      isRouterUrl(providerModelsPath) &&
      !hasSelectedToken &&
      !hasApiKey &&
      !hasAccessCode;

    if (shouldSkipRouterFetch) {
      return [];
    }

    try {
      const headers = getHeadersForRouterModelAccess(providerModelsPath);
      const res = await fetch(providerModelsPath, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        throw new Error(
          `[Router Models] provider models fetch failed: ${res.status}`,
        );
      }

      const resJson = (await res.json()) as RouterProviderModelsResponse;
      return buildModelsFromProviderModels(resJson.data ?? []);
    } catch (error) {
      console.warn("[Router Models] failed to fetch provider models", error);
      return [];
    }
  }

  async models(): Promise<LLMModel[]> {
    const listPath = this.path(OpenaiPath.ListModelPath);
    const accessStore = useAccessStore.getState();
    const hasAccessCode =
      accessStore.enabledAccessControl() &&
      accessStore.accessCode.trim() !== "";
    const hasApiKey = accessStore.openaiApiKey.trim() !== "";
    const hasSelectedToken = accessStore.selectedRouterToken.trim() !== "";
    const shouldSkipRouterFetch =
      isRouterUrl(listPath) &&
      !hasSelectedToken &&
      !hasApiKey &&
      !hasAccessCode;

    if (shouldSkipRouterFetch) {
      return [];
    }

    try {
      const headers = getHeadersForRouterModelAccess(listPath);
      const res = await fetch(listPath, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        throw new Error(`[Router Models] failed to fetch: ${res.status}`);
      }

      const resJson = (await res.json()) as RouterModelListResponse;
      const list = resJson.data ?? [];
      const seen = new Set<string>();
      const finalList: LLMModel[] = [];
      let seq = 1000;

      for (const item of list) {
        const name = item.id?.trim();
        if (!name) continue;
        const supportedEndpoints = normalizeSupportedEndpoints(
          item.supported_endpoints,
        );
        const providerName = resolveProviderNameFromOwnedBy(
          item.owned_by || "",
          name,
          supportedEndpoints,
        );
        const key = `${name}@${providerName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        finalList.push({
          name,
          displayName: name,
          available: true,
          sorted: seq++,
          ownedBy: (item.owned_by || "").trim() || undefined,
          tags: normalizeTags(item.tags),
          specification: item.specification,
          supportedEndpoints,
          provider: {
            id: providerId(providerName),
            providerName,
            providerType: providerId(providerName),
            sorted: providerSort(providerName),
          },
        });
      }

      return finalList;
    } catch (error) {
      console.warn("[Router Models] failed to fetch", error);
      return [];
    }
  }
}
