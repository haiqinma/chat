"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_BASE_URL,
  OpenaiPath,
  Azure,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
  mapOpenAIModelName,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "@/app/store";
import {
  getNativeToolBundle,
  shouldUseNativeMcpTools,
} from "@/app/store/native-tools";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  base64Image2Blob,
  uploadGeneratedImageAndGetStableUrl,
  streamWithThink,
} from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { DalleStyle, ImageQuality, ModelSize } from "@/app/typing";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  normalizeModelEndpointPath,
  SupportedEndpoint,
  SupportedTextEndpoint,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import {
  getRouterAudience,
  getRouterCapabilities,
  getUcanRootCapsKey,
  UCAN_SESSION_ID,
} from "@/app/plugins/ucan";
import {
  getCentralUcanAuthorizationHeaderForAudience,
  isCentralModeEnabled,
} from "@/app/plugins/central-ucan";
import {
  createInvocationUcan,
  getCapabilityAction,
  getCapabilityResource,
  normalizeUcanCapabilities,
  type UcanCapability,
} from "@yeying-community/web3-bs";
import { getCachedUcanSession } from "@/app/plugins/ucan-session";
import {
  getErrorMessage,
  invalidateUcan,
  invalidateUcanAndThrow,
  shouldInvalidateUcanByError,
} from "@/app/plugins/ucan-auth";
import {
  getMessageTextContent,
  isVisionModel,
  isDalle3 as _isDalle3,
  isGptImageModel,
  getTimeoutMSByModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface RequestPayload {
  messages: {
    role: "developer" | "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  model: string;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

export interface DalleRequestPayload {
  model: string;
  prompt: string;
  response_format: "url" | "b64_json";
  n: number;
  size: ModelSize;
  quality: ImageQuality;
  style: DalleStyle;
}

const dalleQualityValues = ["standard", "hd"];
const gptImageQualityValues = ["auto", "low", "medium", "high"];

function resolveImageQuality(model: string, quality?: ImageQuality) {
  if (_isDalle3(model)) {
    return dalleQualityValues.includes(quality ?? "") ? quality : "standard";
  }
  if (isGptImageModel(model)) {
    return gptImageQualityValues.includes(quality ?? "") ? quality : "auto";
  }
  return quality;
}

const ROUTER_HOST = "llm.yeying.pub";
const INVOCATION_TOKEN_SKEW_MS = 5 * 1000;
type CachedInvocationToken = {
  key: string;
  token: string;
  exp: number;
  nbf?: number;
};
let cachedRouterInvocationToken: CachedInvocationToken | null = null;

async function uploadGeneratedImageAndGetStableUrlFromBase64(b64Json: string) {
  return await uploadGeneratedImageAndGetStableUrl(
    base64Image2Blob(b64Json, "image/png"),
  );
}

const ROUTER_BACKEND_HOST = (() => {
  try {
    const url = getClientConfig()?.routerBackendUrl;
    if (!url) return "";
    return new URL(url).host;
  } catch {
    return "";
  }
})();

function isRouterUrl(url: string): boolean {
  try {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(url, base);
    return (
      parsed.host.includes(ROUTER_HOST) ||
      (ROUTER_BACKEND_HOST !== "" && parsed.host === ROUTER_BACKEND_HOST)
    );
  } catch {
    return false;
  }
}

function isUcanMetaValid(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const expRaw = localStorage.getItem("ucanRootExp");
    const iss = localStorage.getItem("ucanRootIss");
    const caps = localStorage.getItem("ucanRootCaps");
    const account = localStorage.getItem("currentAccount") || "";
    if (!expRaw || !iss || !account) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    if (!caps || caps !== getUcanRootCapsKey()) return false;
    return iss === `did:pkh:eth:${account.toLowerCase()}`;
  } catch {
    return false;
  }
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

function decodeUcanPayload(token: string): {
  exp?: number;
  nbf?: number;
} | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as { exp?: number; nbf?: number };
  } catch {
    return null;
  }
}

function buildCapsKey(caps: UcanCapability[]) {
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

function buildRouterInvocationCacheKey(
  audience: string,
  capabilities: UcanCapability[],
) {
  if (typeof localStorage === "undefined") return "";
  const account = localStorage.getItem("currentAccount") || "";
  const rootCaps = localStorage.getItem("ucanRootCaps") || "";
  return `${account}|${rootCaps}|${audience}|${buildCapsKey(capabilities)}`;
}

function getValidCachedRouterInvocationToken(
  audience: string,
  capabilities: UcanCapability[],
) {
  const cacheKey = buildRouterInvocationCacheKey(audience, capabilities);
  const cached = cachedRouterInvocationToken;
  if (!cached || !cacheKey || cached.key !== cacheKey) {
    return null;
  }
  const now = Date.now();
  if (cached.nbf && now < cached.nbf) {
    return null;
  }
  if (cached.exp <= now + INVOCATION_TOKEN_SKEW_MS) {
    return null;
  }
  return cached.token;
}

export async function getHeadersWithRouterUcan(
  url: string,
  providerNameOverride?: string,
) {
  const headers = getHeaders(false, providerNameOverride);
  const hasFallbackAuthorization = Boolean(headers["Authorization"]);
  if (isCentralModeEnabled()) {
    if (!isRouterUrl(url)) return headers;
    const audience = getRouterAudience();
    const capabilities = getRouterCapabilities();
    if (!audience || !capabilities.length) return headers;
    try {
      const centralAuthorization =
        await getCentralUcanAuthorizationHeaderForAudience({
          audience,
          capabilities,
        });
      if (centralAuthorization) {
        headers["Authorization"] = centralAuthorization;
      }
    } catch (error) {
      if (!hasFallbackAuthorization) {
        throw error;
      }
      console.warn("[UCAN] Failed to issue central invocation", error);
    }
    return headers;
  }
  if (!isRouterUrl(url)) return headers;
  if (!isUcanMetaValid()) return headers;

  const audience = getRouterAudience();
  const capabilities = getRouterCapabilities();
  if (!audience || !capabilities.length) return headers;

  const cachedToken = getValidCachedRouterInvocationToken(
    audience,
    capabilities,
  );
  if (cachedToken) {
    headers["Authorization"] = `Bearer ${cachedToken}`;
    return headers;
  }

  // Do not proactively wake the wallet on request paths.
  // If a valid UCAN session has already been stored locally, use it.
  const issuer = await getCachedUcanSession();
  if (!issuer) {
    cachedRouterInvocationToken = null;
    if (!hasFallbackAuthorization) {
      return await invalidateUcanAndThrow("UCAN session is not available");
    }
    await invalidateUcan("UCAN session is not available");
    return headers;
  }

  try {
    const ucan = await createInvocationUcan({
      audience,
      capabilities,
      sessionId: UCAN_SESSION_ID,
      issuer,
    });
    const payload = decodeUcanPayload(ucan);
    const key = buildRouterInvocationCacheKey(audience, capabilities);
    if (payload && typeof payload.exp === "number" && key) {
      cachedRouterInvocationToken = {
        key,
        token: ucan,
        exp: payload.exp,
        nbf: payload.nbf,
      };
    }
    headers["Authorization"] = `Bearer ${ucan}`;
  } catch (error) {
    cachedRouterInvocationToken = null;
    if (shouldInvalidateUcanByError(error)) {
      if (!hasFallbackAuthorization) {
        return await invalidateUcanAndThrow(
          getErrorMessage(error) || "UCAN invocation failed",
        );
      }
      await invalidateUcan(getErrorMessage(error) || "UCAN invocation failed");
      return headers;
    }
    console.warn("[UCAN] Failed to create invocation", error);
  }
  return headers;
}

function isResponsesPath(path: string) {
  return path.includes("/v1/responses");
}

function resolveOpenAIEndpointPath(endpointPath?: string): string | undefined {
  const normalized = normalizeModelEndpointPath(endpointPath);
  if (!normalized) return undefined;
  if (
    normalized !== SupportedEndpoint.ImagesGenerations &&
    normalized !== SupportedTextEndpoint.Responses &&
    normalized !== SupportedTextEndpoint.ChatCompletions
  ) {
    return undefined;
  }
  return normalized;
}

function normalizeResponsesTextFormat(responseFormat: any) {
  if (!responseFormat || typeof responseFormat !== "object") return undefined;
  if (!responseFormat.type) return undefined;
  const format: Record<string, any> = {
    type: responseFormat.type,
  };
  if (
    responseFormat.type === "json_schema" &&
    responseFormat.json_schema &&
    typeof responseFormat.json_schema === "object"
  ) {
    const schema = responseFormat.json_schema;
    ["name", "schema", "strict", "description"].forEach((key) => {
      if (schema[key] !== undefined) format[key] = schema[key];
    });
  }
  return format;
}

function buildRequestTimeoutError(timeoutMS: number): Error {
  return new Error(
    `request timed out after ${Math.round(
      timeoutMS / 1000,
    )}s while waiting for server response`,
  );
}

function getResponsesTextContentType(role: string) {
  return role === "assistant" ? "output_text" : "input_text";
}

function normalizeResponsesInputContent(content: any, role = "user") {
  const textType = getResponsesTextContentType(role);
  if (typeof content === "string") {
    return [
      {
        type: textType,
        text: content,
      },
    ];
  }
  if (!Array.isArray(content)) return content;

  let changed = false;
  const converted = content.map((part: any) => {
    if (!part || typeof part !== "object") return part;
    const partType = typeof part.type === "string" ? part.type : "";
    if (
      partType === "text" ||
      partType === "input_text" ||
      partType === "output_text"
    ) {
      changed = true;
      return {
        type: textType,
        text: typeof part.text === "string" ? part.text : "",
      };
    }
    if (partType === "image_url") {
      let url = "";
      let detail = "";
      if (typeof part.image_url === "string") {
        url = part.image_url;
      } else if (part.image_url && typeof part.image_url === "object") {
        if (typeof part.image_url.url === "string") {
          url = part.image_url.url;
        }
        if (typeof part.image_url.detail === "string") {
          detail = part.image_url.detail;
        }
      }
      if (!url) return part;
      changed = true;
      return {
        type: "input_image",
        image_url: url,
        ...(detail ? { detail } : {}),
      };
    }
    if (partType === "file_url") {
      let url = "";
      let filename = "";
      if (typeof part.file_url === "string") {
        url = part.file_url;
      } else if (part.file_url && typeof part.file_url === "object") {
        if (typeof part.file_url.url === "string") {
          url = part.file_url.url;
        }
        if (typeof part.file_url.name === "string") {
          filename = part.file_url.name;
        }
      }
      if (!url) return part;
      changed = true;
      return {
        type: "input_file",
        file_url: url,
        ...(filename ? { filename } : {}),
      };
    }
    return part;
  });

  return changed ? converted : content;
}

function normalizeResponsesInputMessages(input: any) {
  if (!Array.isArray(input)) return input;
  let changed = false;
  const normalized = input.map((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    if (!Object.prototype.hasOwnProperty.call(item, "content")) return item;
    const role = typeof item.role === "string" ? item.role : "user";
    const nextContent = normalizeResponsesInputContent(item.content, role);
    if (nextContent === item.content) return item;
    changed = true;
    return {
      ...item,
      content: nextContent,
    };
  });
  return changed ? normalized : input;
}

function hasResponsesNonTextInput(input: any): boolean {
  if (!Array.isArray(input)) return false;
  return input.some((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (!Array.isArray(item.content)) return false;
    return item.content.some((part: any) => {
      const partType = typeof part?.type === "string" ? part.type : "";
      return (
        partType === "input_image" ||
        partType === "image_url" ||
        partType === "input_file" ||
        partType === "file_url"
      );
    });
  });
}

function toResponsesTools(tools: any[]) {
  return (tools || []).map((tool) => {
    if (!tool || typeof tool !== "object") return tool;
    if (tool.type !== "function") return tool;
    if (!tool.function || typeof tool.function !== "object") return tool;
    const fn = tool.function;
    const normalized: Record<string, any> = {
      type: "function",
    };
    if (typeof fn.name === "string" && fn.name) normalized.name = fn.name;
    if (typeof fn.description === "string" && fn.description) {
      normalized.description = fn.description;
    }
    if (fn.parameters !== undefined) normalized.parameters = fn.parameters;
    if (fn.strict !== undefined) normalized.strict = fn.strict;
    return normalized;
  });
}

function extractResponsesInstructionText(content: any): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const texts = content
    .map((part: any) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "text" || part.type === "input_text") {
        return typeof part.text === "string" ? part.text : "";
      }
      return "";
    })
    .filter(Boolean);
  return texts.join("\n").trim();
}

function buildResponsesInputAndInstructions(
  messages: Array<{ role: string; content: any }>,
) {
  const instructions: string[] = [];
  const input: Array<{ role: string; content: any }> = [];
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "user";
    if (role === "system" || role === "developer") {
      const text = extractResponsesInstructionText(message.content);
      if (text) instructions.push(text);
      continue;
    }
    input.push({
      role,
      content: message.content,
    });
  }
  return {
    instructions: instructions.join("\n\n").trim(),
    input: normalizeResponsesInputMessages(input),
  };
}

function toResponsesFunctionOutputs(toolCallResult: any[]) {
  return (toolCallResult || [])
    .map((result: any) => {
      const callId =
        typeof result?.tool_call_id === "string" ? result.tool_call_id : "";
      if (!callId) return null;
      let output = result?.content;
      if (typeof output !== "string") {
        try {
          output = JSON.stringify(output ?? "");
        } catch {
          output = String(output ?? "");
        }
      }
      return {
        type: "function_call_output",
        call_id: callId,
        output,
      };
    })
    .filter(Boolean);
}

const RESPONSES_ALLOWED_FIELDS = new Set([
  "background",
  "context_management",
  "conversation",
  "include",
  "input",
  "instructions",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "model",
  "parallel_tool_calls",
  "previous_response_id",
  "prompt",
  "prompt_cache_key",
  "prompt_cache_retention",
  "reasoning",
  "safety_identifier",
  "service_tier",
  "store",
  "stream",
  "stream_options",
  "temperature",
  "text",
  "tool_choice",
  "tools",
  "top_p",
  "truncation",
  "user",
]);

function isReasoningModel(model: string) {
  const id = model.toLowerCase().trim();
  if (!id) return false;
  return id.startsWith("gpt-5") || id.startsWith("o1") || id.startsWith("o3");
}

function toResponsesPayload(payload: Record<string, any>) {
  const source = { ...payload };
  const normalized: Record<string, any> = {};
  const assign = (key: string, value: any) => {
    if (value !== undefined) normalized[key] = value;
  };

  assign("model", source.model);
  assign("background", source.background);
  assign("context_management", source.context_management);
  assign("conversation", source.conversation);
  assign("include", source.include);
  assign("instructions", source.instructions);
  assign("metadata", source.metadata);
  assign("previous_response_id", source.previous_response_id);
  assign("prompt", source.prompt);
  assign("prompt_cache_key", source.prompt_cache_key);
  assign("prompt_cache_retention", source.prompt_cache_retention);
  assign("safety_identifier", source.safety_identifier);
  assign("service_tier", source.service_tier);
  assign("store", source.store);
  assign("temperature", source.temperature);
  assign("top_p", source.top_p);
  assign("truncation", source.truncation);
  assign("user", source.user);

  if (source.input !== undefined) {
    assign("input", normalizeResponsesInputMessages(source.input));
  }

  let maxOutputTokens = source.max_output_tokens;
  if (maxOutputTokens === undefined) {
    if (typeof source.max_completion_tokens === "number") {
      maxOutputTokens = source.max_completion_tokens;
    } else if (typeof source.max_tokens === "number") {
      maxOutputTokens = source.max_tokens;
    }
  }
  assign("max_output_tokens", maxOutputTokens);

  if (source.stream !== undefined) {
    assign("stream", source.stream);
  }
  if (source.stream === true && source.stream_options !== undefined) {
    assign("stream_options", source.stream_options);
  }

  if (
    source.reasoning !== undefined &&
    isReasoningModel(String(source.model ?? ""))
  ) {
    assign("reasoning", source.reasoning);
  }

  const normalizedTools = Array.isArray(source.tools) ? source.tools : [];
  if (normalizedTools.length > 0) {
    assign("tools", normalizedTools);
    assign("tool_choice", source.tool_choice);
    assign("parallel_tool_calls", source.parallel_tool_calls);
    assign("max_tool_calls", source.max_tool_calls);
  }

  let text =
    source.text && typeof source.text === "object"
      ? { ...source.text }
      : undefined;
  if (source.response_format !== undefined) {
    const format = normalizeResponsesTextFormat(source.response_format);
    if (format) {
      text = { ...(text ?? {}), format };
    }
  }
  if (text && Object.keys(text).length > 0) {
    assign("text", text);
  }

  const sanitized: Record<string, any> = {};
  Object.keys(normalized).forEach((key) => {
    if (!RESPONSES_ALLOWED_FIELDS.has(key)) return;
    if (normalized[key] === undefined) return;
    sanitized[key] = normalized[key];
  });
  return sanitized;
}

function extractResponsesTextFromOutput(output: any): string {
  if (!Array.isArray(output)) return "";
  const texts: string[] = [];
  output.forEach((item: any) => {
    if (typeof item?.output_text === "string" && item.output_text) {
      texts.push(item.output_text);
    }
    if (Array.isArray(item?.content)) {
      item.content.forEach((c: any) => {
        if (typeof c?.output_text === "string" && c.output_text) {
          texts.push(c.output_text);
        } else if (typeof c?.text === "string" && c.text) {
          texts.push(c.text);
        }
      });
    } else if (typeof item?.text === "string" && item.text) {
      texts.push(item.text);
    }
  });
  return texts.join("\n\n");
}

function extractResponsesStreamFallbackText(payload: any): string {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text) {
    return payload.output_text;
  }
  if (typeof payload.text === "string" && payload.text) {
    return payload.text;
  }
  if (typeof payload.delta === "string" && payload.delta) {
    return payload.delta;
  }
  if (payload.response && typeof payload.response === "object") {
    if (
      typeof payload.response.output_text === "string" &&
      payload.response.output_text
    ) {
      return payload.response.output_text;
    }
    const nested = extractResponsesTextFromOutput(payload.response.output);
    if (nested) return nested;
  }
  return extractResponsesTextFromOutput(payload.output);
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = false;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      if (isAzure && !accessStore.isValidAzure()) {
        throw Error(
          "incomplete azure config, please check it in your settings page",
        );
      }

      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async extractMessage(res: any) {
    // handle responses api output
    if (typeof res?.output_text === "string" && res.output_text) {
      return res.output_text;
    }
    if (Array.isArray(res?.output)) {
      const outputText = extractResponsesTextFromOutput(res.output);
      if (outputText) return outputText;
    }
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        url = await uploadGeneratedImageAndGetStableUrlFromBase64(b64_json);
      }
      return [
        {
          type: "image_url",
          image_url: {
            url,
          },
        },
      ];
    }
    const messageContent = res.choices?.at(0)?.message?.content;
    if (typeof messageContent === "string" || Array.isArray(messageContent)) {
      return messageContent;
    }
    try {
      return JSON.stringify(res, null, 2);
    } catch {
      return String(res);
    }
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechHeaders = await getHeadersWithRouterUcan(speechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: speechHeaders,
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    }
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };
    const resolvedModel = mapOpenAIModelName(options.config.model);
    const isDalle3 = _isDalle3(resolvedModel);
    const endpointPath = resolveOpenAIEndpointPath(options.config.endpointPath);
    const useImageGenerationEndpoint =
      endpointPath === SupportedEndpoint.ImagesGenerations || isDalle3;
    const isO1OrO3 =
      resolvedModel.startsWith("o1") ||
      resolvedModel.startsWith("o3") ||
      resolvedModel.startsWith("o4-mini");
    const isGpt5 = resolvedModel.startsWith("gpt-5");
    const shouldStream = !useImageGenerationEndpoint && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    let index = -1;
    let sawResponsesDelta = false;
    let latestResponsesId = "";
    const responsesToolIndexByOutput = new Map<number, number>();
    const responsesToolIndexByItemId = new Map<string, number>();

    try {
      let tools: any[] = [];
      let funcs: Record<string, Function> = {};
      if (shouldStream) {
        const toolPair = (await getNativeToolBundle(
          useChatStore.getState().currentSession().mask?.plugin || [],
          {
            includeMcp: shouldUseNativeMcpTools({
              providerName: modelConfig.providerName,
              endpointPath,
            }),
          },
        )) as [any[], Record<string, Function>];
        tools = toolPair[0] ?? [];
        funcs = toolPair[1] ?? {};
      }

      const useResponsesEndpoint =
        !useImageGenerationEndpoint &&
        modelConfig.providerName !== ServiceProvider.Azure &&
        (endpointPath
          ? endpointPath === SupportedTextEndpoint.Responses
          : true);

      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        // find model, and get displayName as deployName
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (useImageGenerationEndpoint ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        const textPath = endpointPath
          ? endpointPath.replace(/^\//, "")
          : useResponsesEndpoint
            ? OpenaiPath.ResponsePath
            : OpenaiPath.ChatPath;
        chatPath = this.path(
          useImageGenerationEndpoint ? OpenaiPath.ImagePath : textPath,
        );
      }

      const requestTools = useResponsesEndpoint
        ? toResponsesTools(tools)
        : tools;
      let requestPayload:
        | RequestPayload
        | DalleRequestPayload
        | Record<string, any>;

      if (useImageGenerationEndpoint) {
        const prompt = getMessageTextContent(
          options.messages.slice(-1)?.pop() as any,
        );
        const imagePayload: Record<string, any> = {
          model: resolvedModel,
          prompt,
          // URLs are only valid for 60 minutes after the image has been generated.
          response_format: "b64_json", // using b64_json, and save image in CacheStorage
          n: 1,
          size: options.config?.size ?? "1024x1024",
        };
        if (isDalle3) {
          imagePayload.quality = resolveImageQuality(
            resolvedModel,
            options.config?.quality,
          );
          imagePayload.style = options.config?.style ?? "vivid";
        } else if (isGptImageModel(resolvedModel)) {
          imagePayload.quality = resolveImageQuality(
            resolvedModel,
            options.config?.quality,
          );
        }
        requestPayload = imagePayload;
      } else {
        const visionModel = isVisionModel(options.config.model);
        const messages: Array<{ role: string; content: any }> = [];
        for (const v of options.messages) {
          const content = visionModel
            ? await preProcessImageContent(v.content)
            : getMessageTextContent(v);
          if (!(isO1OrO3 && v.role === "system")) {
            messages.push({ role: v.role, content });
          }
        }

        if (useResponsesEndpoint) {
          const { instructions, input } =
            buildResponsesInputAndInstructions(messages);
          const hasNonTextInput = hasResponsesNonTextInput(input);
          const responsesPayload: Record<string, any> = {
            model: resolvedModel,
            input,
            stream: options.config.stream,
            max_output_tokens: modelConfig.max_tokens,
          };
          if (!isO1OrO3 && !hasNonTextInput) {
            responsesPayload.temperature = modelConfig.temperature;
            responsesPayload.top_p = modelConfig.top_p;
          }
          if (instructions) {
            responsesPayload.instructions = instructions;
          }
          if (requestTools.length > 0) {
            responsesPayload.tools = requestTools;
            responsesPayload.tool_choice = "auto";
            responsesPayload.parallel_tool_calls = true;
          }
          requestPayload = toResponsesPayload(responsesPayload);
        } else {
          const chatPayload: RequestPayload = {
            messages: messages as RequestPayload["messages"],
            stream: options.config.stream,
            model: resolvedModel,
            temperature: !isO1OrO3 ? modelConfig.temperature : 1,
            presence_penalty: !isO1OrO3 ? modelConfig.presence_penalty : 0,
            frequency_penalty: !isO1OrO3 ? modelConfig.frequency_penalty : 0,
            top_p: !isO1OrO3 ? modelConfig.top_p : 1,
          };
          if (!isGpt5 && isO1OrO3) {
            chatPayload.messages.unshift({
              role: "developer",
              content: "Formatting re-enabled",
            });
            chatPayload.max_completion_tokens = modelConfig.max_tokens;
          }
          if (visionModel && !isO1OrO3 && !isGpt5) {
            chatPayload.max_tokens = Math.max(modelConfig.max_tokens, 4000);
          }
          if (isGpt5) {
            delete (chatPayload as any).max_tokens;
            delete (chatPayload as any).max_completion_tokens;
          }
          requestPayload = chatPayload;
        }
      }

      console.log("[Request] openai payload: ", requestPayload);
      console.log("[Request] openai endpoint:", chatPath, {
        stream: shouldStream,
        responses: isResponsesPath(chatPath),
        tools: requestTools.length,
      });

      if (shouldStream) {
        const ensureResponsesToolCall = (
          runTools: ChatMessageTool[],
          outputIndex: number,
          itemId: string,
          callId: string,
          name: string,
        ) => {
          let toolIndex = -1;
          if (
            Number.isInteger(outputIndex) &&
            responsesToolIndexByOutput.has(outputIndex)
          ) {
            toolIndex = responsesToolIndexByOutput.get(outputIndex) ?? -1;
          }
          if (
            toolIndex < 0 &&
            itemId &&
            responsesToolIndexByItemId.has(itemId)
          ) {
            toolIndex = responsesToolIndexByItemId.get(itemId) ?? -1;
          }
          if (toolIndex < 0) {
            toolIndex = runTools.length;
            runTools.push({
              id: callId || itemId || `response_tool_${runTools.length}`,
              type: "function",
              function: {
                name: name || "",
                arguments: "",
              },
            });
          }
          if (Number.isInteger(outputIndex) && outputIndex >= 0) {
            responsesToolIndexByOutput.set(outputIndex, toolIndex);
          }
          if (itemId) {
            responsesToolIndexByItemId.set(itemId, toolIndex);
          }
          const current = runTools[toolIndex];
          if (!current.function) {
            current.function = {
              name: "",
              arguments: "",
            };
          }
          if (callId) {
            current.id = callId;
          }
          if (name) {
            current.function.name = name;
          }
          return toolIndex;
        };

        const chatHeaders = await getHeadersWithRouterUcan(
          chatPath,
          modelConfig.providerName,
        );
        streamWithThink(
          chatPath,
          requestPayload,
          chatHeaders,
          requestTools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            const json = JSON.parse(text);
            if (useResponsesEndpoint) {
              const eventType = typeof json?.type === "string" ? json.type : "";
              if (!eventType.startsWith("response.")) {
                return { isThinking: false, content: "" };
              }

              const responseId =
                typeof json?.response?.id === "string" ? json.response.id : "";
              if (responseId) {
                latestResponsesId = responseId;
              }

              if (
                eventType === "response.output_item.added" ||
                eventType === "response.output_item.done"
              ) {
                const item = json?.item;
                if (item?.type === "function_call") {
                  const outputIndex =
                    typeof json?.output_index === "number"
                      ? json.output_index
                      : -1;
                  const itemId = typeof item?.id === "string" ? item.id : "";
                  const callId =
                    typeof item?.call_id === "string" ? item.call_id : "";
                  const name = typeof item?.name === "string" ? item.name : "";
                  const argumentsText =
                    typeof item?.arguments === "string" ? item.arguments : "";
                  const toolIndex = ensureResponsesToolCall(
                    runTools,
                    outputIndex,
                    itemId,
                    callId,
                    name,
                  );
                  if (argumentsText) {
                    runTools[toolIndex].function!.arguments = argumentsText;
                  }
                }
              }

              if (eventType === "response.function_call_arguments.delta") {
                const outputIndex =
                  typeof json?.output_index === "number"
                    ? json.output_index
                    : -1;
                const itemId =
                  typeof json?.item_id === "string" ? json.item_id : "";
                const callId =
                  typeof json?.call_id === "string" ? json.call_id : "";
                const toolIndex = ensureResponsesToolCall(
                  runTools,
                  outputIndex,
                  itemId,
                  callId,
                  "",
                );
                if (typeof json?.delta === "string") {
                  const prev = runTools[toolIndex].function?.arguments ?? "";
                  runTools[toolIndex].function!.arguments = prev + json.delta;
                }
              }

              if (eventType === "response.function_call_arguments.done") {
                const outputIndex =
                  typeof json?.output_index === "number"
                    ? json.output_index
                    : -1;
                const itemId =
                  typeof json?.item_id === "string" ? json.item_id : "";
                const callId =
                  typeof json?.call_id === "string" ? json.call_id : "";
                const toolIndex = ensureResponsesToolCall(
                  runTools,
                  outputIndex,
                  itemId,
                  callId,
                  "",
                );
                if (typeof json?.arguments === "string") {
                  runTools[toolIndex].function!.arguments = json.arguments;
                }
              }

              const reasoningContent =
                eventType === "response.reasoning_summary_text.delta" ||
                eventType === "response.reasoning_text.delta"
                  ? extractResponsesStreamFallbackText(json)
                  : "";
              if (reasoningContent) {
                return {
                  isThinking: true,
                  content: reasoningContent,
                };
              }

              const content = extractResponsesStreamFallbackText(json);
              if (eventType === "response.output_text.delta" && content) {
                sawResponsesDelta = true;
              }
              if (
                sawResponsesDelta &&
                (eventType === "response.output_text" ||
                  eventType === "response.output_text.done" ||
                  eventType === "response.completed")
              ) {
                return { isThinking: false, content: "" };
              }
              return {
                isThinking: false,
                content: content ?? "",
              };
            }

            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;

            if (choices?.length) {
              const tool_calls = choices[0]?.delta?.tool_calls;
              if (tool_calls?.length > 0) {
                const id = tool_calls[0]?.id;
                const args = tool_calls[0]?.function?.arguments;
                if (id) {
                  index += 1;
                  runTools.push({
                    id,
                    type: tool_calls[0]?.type,
                    function: {
                      name: tool_calls[0]?.function?.name as string,
                      arguments: args,
                    },
                  });
                } else if (
                  runTools[index]?.function &&
                  typeof args === "string"
                ) {
                  const prev = runTools[index].function?.arguments ?? "";
                  runTools[index].function!.arguments = prev + args;
                }
              }

              const reasoning = choices[0]?.delta?.reasoning_content;
              const content = choices[0]?.delta?.content;

              // Skip if both content and reasoning_content are empty or null
              if (
                (!reasoning || reasoning.length === 0) &&
                (!content || content.length === 0)
              ) {
                return {
                  isThinking: false,
                  content: "",
                };
              }

              if (reasoning && reasoning.length > 0) {
                return {
                  isThinking: true,
                  content: reasoning,
                };
              } else if (content && content.length > 0) {
                return {
                  isThinking: false,
                  content: content,
                };
              }

              return {
                isThinking: false,
                content: "",
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            if (useResponsesEndpoint) {
              responsesToolIndexByItemId.clear();
              responsesToolIndexByOutput.clear();
              const outputs = toResponsesFunctionOutputs(toolCallResult);
              (requestPayload as any).input = outputs;
              if (latestResponsesId) {
                (requestPayload as any).previous_response_id =
                  latestResponsesId;
              }
              delete (requestPayload as any).messages;
              return;
            }
            if (Array.isArray((requestPayload as any)?.messages)) {
              (requestPayload as any).messages.splice(
                (requestPayload as any).messages.length,
                0,
                toolCallMessage,
                ...toolCallResult,
              );
              return;
            }
            if (Array.isArray((requestPayload as any)?.input)) {
              (requestPayload as any).input.splice(
                (requestPayload as any).input.length,
                0,
                toolCallMessage,
                ...toolCallResult,
              );
              return;
            }
            (requestPayload as any).input = [
              toolCallMessage,
              ...toolCallResult,
            ];
          },
          options,
        );
      } else {
        const chatHeaders = await getHeadersWithRouterUcan(
          chatPath,
          modelConfig.providerName,
        );
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: chatHeaders,
        };

        // make a fetch request
        const timeoutMS = getTimeoutMSByModel(options.config.model);
        const requestTimeoutId = setTimeout(
          () => controller.abort(buildRequestTimeoutError(timeoutMS)),
          timeoutMS,
        );
        try {
          const res = await fetch(chatPath, chatPayload);
          const resJson = await res.json();
          const message = await this.extractMessage(resJson);
          options.onFinish(message, res);
        } finally {
          clearTimeout(requestTimeoutId);
        }
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      const timeoutError =
        controller.signal.aborted && controller.signal.reason instanceof Error
          ? controller.signal.reason
          : (e as Error);
      options.onError?.(timeoutError);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const usagePath = this.path(
      `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
    );
    const subsPath = this.path(OpenaiPath.SubsPath);
    const [usageHeaders, subsHeaders] = await Promise.all([
      getHeadersWithRouterUcan(usagePath),
      getHeadersWithRouterUcan(subsPath),
    ]);
    const [used, subs] = await Promise.all([
      fetch(usagePath, {
        method: "GET",
        headers: usageHeaders,
      }),
      fetch(subsPath, {
        method: "GET",
        headers: subsHeaders,
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    const listPath = this.path(OpenaiPath.ListModelPath);
    const shouldSkipRouterFetch = isRouterUrl(listPath) && !isUcanMetaValid();

    if (shouldSkipRouterFetch || this.disableListModels) {
      if (shouldSkipRouterFetch) {
        console.info("[Models] skip router fetch before UCAN login");
      }
      return [];
    }

    const fetchFromApi = async () => {
      const listHeaders = await getHeadersWithRouterUcan(listPath);
      const res = await fetch(listPath, {
        method: "GET",
        headers: {
          ...listHeaders,
        },
      });
      if (!res.ok) {
        throw new Error(`[Models] failed to fetch: ${res.status}`);
      }

      const resJson = (await res.json()) as OpenAIListModelResponse;
      const list = resJson.data ?? [];
      console.log("[Models] router returned", list.length, "items");
      return list;
    };

    let modelsFromApi: OpenAIListModelResponse["data"] = [];
    try {
      modelsFromApi = await fetchFromApi();
    } catch (error) {
      console.warn("[Models] failed to fetch models", error);
      return [];
    }

    if (!modelsFromApi || modelsFromApi.length === 0) {
      return [];
    }

    const preferredOrder = [
      "gpt-5.1",
      "gpt-5-chat",
      "deepseek-chat",
      "deepseek-reasoner",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250929",
      "gemini-3-pro-preview",
    ];
    const displayNameMap: Record<string, string> = {
      "gpt-5.1": "GPT-5.1",
      "gpt-5-chat": "GPT-5 Chat",
      "deepseek-chat": "DeepSeek Chat",
      "deepseek-reasoner": "DeepSeek Reasoner",
      "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (20251001)",
      "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5 (20250929)",
      "gemini-3-pro-preview": "Gemini 3 Pro Preview",
    };

    const normalized = modelsFromApi
      .map((m) => m.id)
      .filter(Boolean)
      .map((id) => mapOpenAIModelName(id));

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia == -1 && ib == -1) return a.localeCompare(b);
      if (ia == -1) return 1;
      if (ib == -1) return -1;
      return ia - ib;
    });

    let seq = 1000; // keep consistent ordering
    const finalList = unique.map((name) => ({
      name,
      displayName: displayNameMap[name] ?? name,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));
    console.log("[Models] final list", finalList);
    return finalList;
  }
}
export { OpenaiPath };
