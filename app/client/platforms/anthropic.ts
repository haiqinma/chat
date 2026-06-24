import { ACCESS_CODE_PREFIX, Anthropic, ApiPath } from "@/app/constant";
import {
  ChatOptions,
  LLMApi,
  normalizeModelEndpointPath,
  SupportedTextEndpoint,
  SpeechOptions,
} from "../api";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  allowSkillNativeToolBridge,
  getSkillApiTools,
  getSkillToolServers,
} from "@/app/store";
import {
  getNativeToolBundle,
  shouldUseNativeToolBridge,
} from "@/app/store/native-tools";
import { getClientConfig } from "@/app/config/client";
import { ANTHROPIC_BASE_URL } from "@/app/constant";
import { getMessageTextContent, isVisionModel } from "@/app/utils";
import { preProcessImageContent, stream } from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";
import { applyMessagesReasoning } from "../reasoning";

export type MultiBlockContent = {
  type: "image" | "text";
  source?: {
    type: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
  text?: string;
};

export type AnthropicMessage = {
  role: (typeof ClaudeMapper)[keyof typeof ClaudeMapper];
  content: string | MultiBlockContent[];
};

export interface AnthropicChatRequest {
  model: string; // The model that will complete your prompt.
  messages: AnthropicMessage[]; // The prompt that you want Claude to complete.
  max_tokens: number; // The maximum number of tokens to generate before stopping.
  stop_sequences?: string[]; // Sequences that will cause the model to stop generating completion text.
  temperature?: number; // Amount of randomness injected into the response.
  top_p?: number; // Use nucleus sampling.
  top_k?: number; // Only sample from the top K options for each subsequent token.
  metadata?: object; // An object describing metadata about the request.
  stream?: boolean; // Whether to incrementally stream the response using server-sent events.
  thinking?: {
    type: "enabled";
    budget_tokens: number;
  };
}

export interface ChatRequest {
  model: string; // The model that will complete your prompt.
  prompt: string; // The prompt that you want Claude to complete.
  max_tokens_to_sample: number; // The maximum number of tokens to generate before stopping.
  stop_sequences?: string[]; // Sequences that will cause the model to stop generating completion text.
  temperature?: number; // Amount of randomness injected into the response.
  top_p?: number; // Use nucleus sampling.
  top_k?: number; // Only sample from the top K options for each subsequent token.
  metadata?: object; // An object describing metadata about the request.
  stream?: boolean; // Whether to incrementally stream the response using server-sent events.
}

export interface ChatResponse {
  completion: string;
  stop_reason: "stop_sequence" | "max_tokens";
  model: string;
}

export type ChatStreamResponse = ChatResponse & {
  stop?: string;
  log_id: string;
};

export function appendAnthropicToolRound(
  messages: Array<Record<string, any>>,
  toolCallMessage: { tool_calls: ChatMessageTool[] },
  toolCallResult: Array<{ tool_call_id: string; content: string }>,
) {
  messages.splice(
    messages.length,
    0,
    {
      role: "assistant",
      content: toolCallMessage.tool_calls.map((tool: ChatMessageTool) => ({
        type: "tool_use",
        id: tool.id,
        name: tool?.function?.name,
        input: tool?.function?.arguments
          ? JSON.parse(tool?.function?.arguments)
          : {},
      })),
    },
    {
      role: "user",
      content: toolCallResult.map((result) => ({
        type: "tool_result",
        tool_use_id: result.tool_call_id,
        content: result.content,
      })),
    },
  );
}

const ClaudeMapper = {
  assistant: "assistant",
  user: "user",
  system: "user",
} as const;

const keys = ["claude-2, claude-instant-1"];
const ROUTER_HOST = "llm.yeying.pub";

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

function applySelectedRouterTokenAuthorization(
  headers: Record<string, string>,
  url: string,
) {
  if (!isRouterUrl(url)) return headers;
  const selectedToken =
    useAccessStore.getState().selectedRouterToken?.trim() || "";
  if (selectedToken) {
    headers["Authorization"] = `Bearer ${selectedToken}`;
  }
  return headers;
}

function getHeadersForRouterModelAccess(url: string) {
  const headers = getBaseGatewayHeaders();
  return applySelectedRouterTokenAuthorization(headers, url);
}

function ensureRouterModelAuthorization(
  url: string,
  headers: Record<string, string>,
) {
  if (isRouterUrl(url) && !headers["Authorization"]) {
    throw new Error("请先在 Router 页面选择可用令牌");
  }
}

function getBaseGatewayHeaders() {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const gatewayApiKey = accessStore.openaiApiKey.trim();
  if (gatewayApiKey) {
    headers["Authorization"] = `Bearer ${gatewayApiKey}`;
    return headers;
  }
  if (
    accessStore.enabledAccessControl() &&
    accessStore.accessCode.trim().length > 0
  ) {
    headers["Authorization"] =
      `Bearer ${ACCESS_CODE_PREFIX}${accessStore.accessCode.trim()}`;
  }
  return headers;
}

function toAnthropicTools(tools: any[]) {
  return (tools || [])
    .map((tool) => {
      const fn = tool?.function;
      if (!fn?.name) return null;
      return {
        name: fn.name,
        description: fn.description,
        input_schema: fn.parameters || {
          type: "object",
          properties: {},
          required: [],
        },
      };
    })
    .filter(Boolean);
}

export class ClaudeApi implements LLMApi {
  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  extractMessage(res: any) {
    console.log("[Response] claude response: ", res);

    return res?.content?.[0]?.text;
  }
  async chat(options: ChatOptions): Promise<void> {
    const visionModel = isVisionModel(options.config.model);

    const accessStore = useAccessStore.getState();

    const shouldStream = !!options.config.stream;

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    // try get base64image from local cache image_url
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      messages.push({ role: v.role, content });
    }

    const keys = ["system", "user"];

    // roles must alternate between "user" and "assistant" in claude, so add a fake assistant message between two user messages
    for (let i = 0; i < messages.length - 1; i++) {
      const message = messages[i];
      const nextMessage = messages[i + 1];

      if (keys.includes(message.role) && keys.includes(nextMessage.role)) {
        messages[i] = [
          message,
          {
            role: "assistant",
            content: ";",
          },
        ] as any;
      }
    }

    const prompt = messages
      .flat()
      .filter((v) => {
        if (!v.content) return false;
        if (typeof v.content === "string" && !v.content.trim()) return false;
        return true;
      })
      .map((v) => {
        const { role, content } = v;
        const insideRole = ClaudeMapper[role] ?? "user";

        if (!visionModel || typeof content === "string") {
          return {
            role: insideRole,
            content: getMessageTextContent(v),
          };
        }
        const multiBlocks: MultiBlockContent[] = [];
        for (const part of content as any[]) {
          if (part?.type === "text") {
            multiBlocks.push({
              type: "text",
              text: part.text ?? "",
            });
            continue;
          }
          if (part?.type !== "image_url") {
            continue;
          }

          const { url = "" } = part.image_url || {};
          if (!url) {
            continue;
          }

          if (url.startsWith("data:")) {
            const colonIndex = url.indexOf(":");
            const semicolonIndex = url.indexOf(";");
            const comma = url.indexOf(",");

            const mimeType = url.slice(colonIndex + 1, semicolonIndex);
            const encodeType = url.slice(semicolonIndex + 1, comma);
            const data = url.slice(comma + 1);

            multiBlocks.push({
              type: "image",
              source: {
                type: encodeType,
                media_type: mimeType,
                data,
              },
            });
            continue;
          }

          multiBlocks.push({
            type: "image",
            source: {
              type: "url",
              url,
            },
          });
        }

        return {
          role: insideRole,
          content: multiBlocks,
        };
      });

    if (prompt[0]?.role === "assistant") {
      prompt.unshift({
        role: "user",
        content: ";",
      });
    }

    // Anthropic new models reject sending both temperature and top_p.
    // Prefer temperature and drop top_p if both are set to avoid 400 errors.
    const useTemperature = modelConfig.temperature;
    const useTopP =
      useTemperature !== undefined && useTemperature !== null
        ? undefined
        : modelConfig.top_p;

    const requestBody: AnthropicChatRequest = {
      messages: prompt,
      stream: shouldStream,

      model: modelConfig.model,
      max_tokens: modelConfig.max_tokens,
      temperature: useTemperature,
      top_p: useTopP,
      // top_k: modelConfig.top_k,
      top_k: 5,
    };
    applyMessagesReasoning(requestBody as any, {
      ...options.config,
      ...modelConfig,
    });

    const endpointPath = normalizeModelEndpointPath(
      options.config.endpointPath,
    );
    const chatEndpointPath =
      endpointPath === SupportedTextEndpoint.Messages
        ? endpointPath.replace(/^\//, "")
        : Anthropic.ChatPath;
    const path = this.path(chatEndpointPath);
    const requestHeaders = getHeadersForRouterModelAccess(path);
    ensureRouterModelAuthorization(path, requestHeaders);

    const controller = new AbortController();
    options.onController?.(controller);

    if (shouldStream) {
      let index = -1;
      const sessionSkill = useChatStore.getState().currentSession().mask;
      const skillApiTools = getSkillApiTools(sessionSkill);
      const skillToolServers = getSkillToolServers(sessionSkill);
      const [tools, funcs] = await getNativeToolBundle(skillApiTools, {
        includeToolServers:
          allowSkillNativeToolBridge(sessionSkill) &&
          shouldUseNativeToolBridge({
            providerName: options.config.providerName,
            endpointPath: chatEndpointPath,
          }),
        toolServerIds: skillToolServers,
      });
      return stream(
        path,
        requestBody,
        requestHeaders,
        toAnthropicTools(tools),
        funcs,
        controller,
        // parseSSE
        (text: string, runTools: ChatMessageTool[]) => {
          // console.log("parseSSE", text, runTools);
          let chunkJson:
            | undefined
            | {
                type:
                  | "content_block_delta"
                  | "content_block_stop"
                  | "message_delta"
                  | "message_stop";
                content_block?: {
                  type: "tool_use";
                  id: string;
                  name: string;
                };
                delta?: {
                  type: "text_delta" | "input_json_delta";
                  text?: string;
                  partial_json?: string;
                  stop_reason?: string;
                };
                index: number;
              };
          chunkJson = JSON.parse(text);

          // Handle refusal stop reason in message_delta
          if (chunkJson?.delta?.stop_reason === "refusal") {
            // Return a message to display to the user
            const refusalMessage =
              "\n\n[Assistant refused to respond. Please modify your request and try again.]";
            options.onError?.(
              new Error("Content policy violation: " + refusalMessage),
            );
            return refusalMessage;
          }

          if (chunkJson?.content_block?.type == "tool_use") {
            index += 1;
            const id = chunkJson?.content_block.id;
            const name = chunkJson?.content_block.name;
            runTools.push({
              id,
              type: "function",
              function: {
                name,
                arguments: "",
              },
            });
          }
          if (
            chunkJson?.delta?.type == "input_json_delta" &&
            chunkJson?.delta?.partial_json
          ) {
            // @ts-ignore
            runTools[index]["function"]["arguments"] +=
              chunkJson?.delta?.partial_json;
          }
          return chunkJson?.delta?.text;
        },
        // processToolMessage, include tool_calls message and tool call results
        (
          requestPayload: RequestPayload,
          toolCallMessage: any,
          toolCallResult: any[],
        ) => {
          // reset index value
          index = -1;
          if (Array.isArray(requestPayload?.messages)) {
            appendAnthropicToolRound(
              requestPayload.messages as Array<Record<string, any>>,
              toolCallMessage,
              toolCallResult,
            );
          }
        },
        {
          ...options,
          getRefreshedHeaders: () =>
            Promise.resolve(getHeadersForRouterModelAccess(path)),
        },
      );
    } else {
      const payload = {
        method: "POST",
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        headers: requestHeaders,
      };

      try {
        controller.signal.onabort = () =>
          options.onFinish("", new Response(null, { status: 400 }));

        const res = await fetch(path, payload);
        const resJson = await res.json();

        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      } catch (e) {
        console.error("failed to chat", e);
        options.onError?.(e as Error);
      }
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }
  async models() {
    // const provider = {
    //   id: "anthropic",
    //   providerName: "Anthropic",
    //   providerType: "anthropic",
    // };

    return [
      // {
      //   name: "claude-instant-1.2",
      //   available: true,
      //   provider,
      // },
      // {
      //   name: "claude-2.0",
      //   available: true,
      //   provider,
      // },
      // {
      //   name: "claude-2.1",
      //   available: true,
      //   provider,
      // },
      // {
      //   name: "claude-3-opus-20240229",
      //   available: true,
      //   provider,
      // },
      // {
      //   name: "claude-3-sonnet-20240229",
      //   available: true,
      //   provider,
      // },
      // {
      //   name: "claude-3-haiku-20240307",
      //   available: true,
      //   provider,
      // },
    ];
  }
  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl: string = "";

    if (accessStore.useCustomConfig) {
      // 统一走网关 URL（历史字段名是 openaiUrl，这里按 gateway 语义使用）。
      const gatewayUrl = trimEnd(accessStore.openaiUrl || "", "/");
      if (gatewayUrl.length > 0) {
        baseUrl = gatewayUrl;
      } else {
        baseUrl = accessStore.anthropicUrl;
      }
    }

    // if endpoint is empty, use default endpoint
    if (baseUrl.trim().length === 0) {
      const isApp = !!getClientConfig()?.isApp;

      baseUrl = isApp ? ANTHROPIC_BASE_URL : ApiPath.Anthropic;
    }

    if (!baseUrl.startsWith("http") && !baseUrl.startsWith("/api")) {
      baseUrl = "https://" + baseUrl;
    }

    baseUrl = trimEnd(baseUrl, "/");

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl(`${baseUrl}/${path}`);
  }
}

function trimEnd(s: string, end = " ") {
  if (end.length === 0) return s;

  while (s.endsWith(end)) {
    s = s.slice(0, -end.length);
  }

  return s;
}
