import { getClientConfig } from "../config/client";
import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  ServiceProvider,
} from "../constant";
import {
  ChatMessageTool,
  ChatMessage,
  ModelType,
  useAccessStore,
  useChatStore,
} from "../store";
import { ChatGPTApi, DalleRequestPayload } from "./platforms/openai";
import { GeminiProApi } from "./platforms/google";
import { ClaudeApi } from "./platforms/anthropic";
import { ErnieApi } from "./platforms/baidu";
import { VolcengineApi } from "./platforms/volcengine";
import { QwenApi } from "./platforms/alibaba";
import { HunyuanApi } from "./platforms/tencent";
import { MoonshotApi } from "./platforms/moonshot";
import { SparkApi } from "./platforms/iflytek";
import { DeepSeekApi } from "./platforms/deepseek";
import { XAIApi } from "./platforms/xai";
import { ChatGLMApi } from "./platforms/glm";
import { SiliconflowApi } from "./platforms/siliconflow";
import { Ai302Api } from "./platforms/ai302";
import { RouterApi } from "./platforms/router";
export {
  SupportedEndpoint,
  SupportedTextEndpoint,
  normalizeModelEndpointPath,
  normalizeSupportedEndpoints,
  selectPreferredRequestEndpoint,
  selectPreferredTextEndpoint,
  supportsImageEditEndpoint,
  supportsImageGenerationEndpoint,
  supportsTextEndpoint,
} from "./endpoints";

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["gpt-3.5-turbo", "gpt-4"] as const;
export const TTSModels = ["tts-1", "tts-1-hd"] as const;
export type ChatModel = ModelType;

export interface MultimodalTextContent {
  type: "text";
  text?: string;
}

export interface MultimodalImageContent {
  type: "image_url";
  image_url?: {
    url: string;
    detail?: "low" | "high" | "auto" | string;
  };
}

export interface MultimodalFileContent {
  type: "file_url";
  file_url?: {
    url: string;
    name?: string;
    mime_type?: string;
  };
}

export type MultimodalContent =
  | MultimodalTextContent
  | MultimodalImageContent
  | MultimodalFileContent;

export interface MultimodalContentForAlibaba {
  text?: string;
  image?: string;
}

export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  providerName?: string;
  endpointPath?: string;
  supportedEndpoints?: string[];
  ownedBy?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  size?: DalleRequestPayload["size"];
  quality?: DalleRequestPayload["quality"];
  style?: DalleRequestPayload["style"];
}

export interface SpeechOptions {
  model: string;
  input: string;
  voice: string;
  response_format?: string;
  speed?: number;
  onController?: (controller: AbortController) => void;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (message: string, responseRes: Response) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
  onBeforeTool?: (tool: ChatMessageTool) => void;
  onAfterTool?: (tool: ChatMessageTool) => void;
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface LLMModel {
  name: string;
  displayName?: string;
  available: boolean;
  provider?: LLMModelProvider;
  sorted: number;
  ownedBy?: string;
  tags?: string[];
  supportedEndpoints?: string[];
  modelType?: string;
  status?: string;
  description?: string;
  isDefault?: boolean;
}

export interface ModelCandidate {
  model: string;
  providerName?: string;
}

export interface LLMModelProvider {
  id: string;
  providerName: string;
  providerType: string;
  sorted: number;
}

function normalizeServiceProviderName(
  providerName?: string,
): ServiceProvider | undefined {
  if (!providerName) return undefined;
  const trimmed = providerName.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  return Object.values(ServiceProvider).find(
    (provider) => provider.toLowerCase() === normalized,
  );
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract speech(options: SpeechOptions): Promise<ArrayBuffer>;
  abstract usage(): Promise<LLMUsage>;
  abstract models(): Promise<LLMModel[]>;
  providerModels?(): Promise<LLMModel[]>;
}

type ProviderName = "openai" | "azure" | "claude" | "palm";

interface Model {
  name: string;
  provider: ProviderName;
  ctxlen: number;
}

interface ChatProvider {
  name: ProviderName;
  apiConfig: {
    baseUrl: string;
    apiKey: string;
    summaryModel: Model;
  };
  models: Model[];

  chat: () => void;
  usage: () => void;
}

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    switch (provider) {
      case ModelProvider.GeminiPro:
        this.llm = new GeminiProApi();
        break;
      case ModelProvider.Claude:
        this.llm = new ClaudeApi();
        break;
      case ModelProvider.Ernie:
        this.llm = new ErnieApi();
        break;
      case ModelProvider.Volcengine:
        this.llm = new VolcengineApi();
        break;
      case ModelProvider.Qwen:
        this.llm = new QwenApi();
        break;
      case ModelProvider.Hunyuan:
        this.llm = new HunyuanApi();
        break;
      case ModelProvider.Moonshot:
        this.llm = new MoonshotApi();
        break;
      case ModelProvider.Iflytek:
        this.llm = new SparkApi();
        break;
      case ModelProvider.DeepSeek:
        this.llm = new DeepSeekApi();
        break;
      case ModelProvider.XAI:
        this.llm = new XAIApi();
        break;
      case ModelProvider.ChatGLM:
        this.llm = new ChatGLMApi();
        break;
      case ModelProvider.SiliconFlow:
        this.llm = new SiliconflowApi();
        break;
      case ModelProvider["302.AI"]:
        this.llm = new Ai302Api();
        break;
      case ModelProvider.Router:
        this.llm = new RouterApi();
        break;
      default:
        this.llm = new ChatGPTApi();
    }
  }

  config() {}

  prompts() {}

  masks() {}

  async share(messages: ChatMessage[], avatarUrl: string | null = null) {
    const msgs = messages
      .map((m) => ({
        from: m.role === "user" ? "human" : "gpt",
        value: m.content,
      }))
      .concat([
        {
          from: "human",
          value: "Share from [Chat]: https://github.com/yeying-community/chat",
        },
      ]);
    // 敬告二开开发者们，为了开源大模型的发展，请不要修改上述消息，此消息用于后续数据清洗使用
    // Please do not modify this message

    console.log("[Share]", messages, msgs);
    const clientConfig = getClientConfig();
    const proxyUrl = "/sharegpt";
    const rawUrl = "https://sharegpt.com/api/conversations";
    const shareUrl = clientConfig?.isApp ? rawUrl : proxyUrl;
    const res = await fetch(shareUrl, {
      body: JSON.stringify({
        avatarUrl,
        items: msgs,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const resJson = await res.json();
    console.log("[Share]", resJson);
    if (resJson.id) {
      return `https://shareg.pt/${resJson.id}`;
    }
  }
}

export function getBearerToken(
  apiKey: string,
  noBearer: boolean = false,
): string {
  return validString(apiKey)
    ? `${noBearer ? "" : "Bearer "}${apiKey.trim()}`
    : "";
}

export function validString(x: string): boolean {
  return x?.length > 0;
}

export function getHeaders(
  ignoreHeaders: boolean = false,
  providerNameOverride?: string,
) {
  const accessStore = useAccessStore.getState();
  const chatStore = useChatStore.getState();
  let headers: Record<string, string> = {};
  if (!ignoreHeaders) {
    headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  const clientConfig = getClientConfig();

  function getConfig() {
    const modelConfig = chatStore.currentSession().mask.modelConfig;
    const providerName =
      normalizeServiceProviderName(
        providerNameOverride ?? modelConfig.providerName,
      ) ?? ServiceProvider.OpenAI;
    const isGoogle = providerName === ServiceProvider.Google;
    const isAzure = providerName === ServiceProvider.Azure;
    const isAnthropic = providerName === ServiceProvider.Anthropic;
    const isBaidu = providerName == ServiceProvider.Baidu;
    const isVolcengine = providerName === ServiceProvider.Volcengine;
    const isAlibaba = providerName === ServiceProvider.Alibaba;
    const isMoonshot = providerName === ServiceProvider.Moonshot;
    const isIflytek = providerName === ServiceProvider.Iflytek;
    const isDeepSeek = providerName === ServiceProvider.DeepSeek;
    const isXAI = providerName === ServiceProvider.XAI;
    const isChatGLM = providerName === ServiceProvider.ChatGLM;
    const isSiliconFlow = providerName === ServiceProvider.SiliconFlow;
    const isAI302 = providerName === ServiceProvider["302.AI"];
    const isEnabledAccessControl = accessStore.enabledAccessControl();
    const apiKey = isGoogle
      ? accessStore.googleApiKey
      : isAzure
        ? accessStore.azureApiKey
        : isAnthropic
          ? accessStore.anthropicApiKey
          : isVolcengine
            ? accessStore.volcengineApiKey
            : isAlibaba
              ? accessStore.alibabaApiKey
              : isMoonshot
                ? accessStore.moonshotApiKey
                : isXAI
                  ? accessStore.xaiApiKey
                  : isDeepSeek
                    ? accessStore.deepseekApiKey
                    : isChatGLM
                      ? accessStore.chatglmApiKey
                      : isSiliconFlow
                        ? accessStore.siliconflowApiKey
                        : isIflytek
                          ? accessStore.iflytekApiKey &&
                            accessStore.iflytekApiSecret
                            ? accessStore.iflytekApiKey +
                              ":" +
                              accessStore.iflytekApiSecret
                            : ""
                          : isAI302
                            ? accessStore.ai302ApiKey
                            : accessStore.openaiApiKey;
    return {
      isGoogle,
      isAzure,
      isAnthropic,
      isBaidu,
      isVolcengine,
      isAlibaba,
      isMoonshot,
      isIflytek,
      isDeepSeek,
      isXAI,
      isChatGLM,
      isSiliconFlow,
      isAI302,
      apiKey,
      isEnabledAccessControl,
    };
  }

  function getAuthHeader(): string {
    return isAzure
      ? "api-key"
      : isAnthropic
        ? "x-api-key"
        : isGoogle
          ? "x-goog-api-key"
          : "Authorization";
  }

  const {
    isGoogle,
    isAzure,
    isAnthropic,
    isBaidu,
    isVolcengine,
    isAlibaba,
    isMoonshot,
    isIflytek,
    isDeepSeek,
    isXAI,
    isChatGLM,
    isSiliconFlow,
    isAI302,
    apiKey,
    isEnabledAccessControl,
  } = getConfig();
  // when using baidu api in app, not set auth header
  if (isBaidu && clientConfig?.isApp) return headers;

  const authHeader = getAuthHeader();

  const bearerToken = getBearerToken(
    apiKey,
    isAzure || isAnthropic || isGoogle,
  );

  if (bearerToken) {
    headers[authHeader] = bearerToken;
  } else if (isEnabledAccessControl && validString(accessStore.accessCode)) {
    headers["Authorization"] = getBearerToken(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
  }

  return headers;
}

export function getClientApi(provider: ServiceProvider | string): ClientApi {
  switch (normalizeServiceProviderName(provider) ?? provider) {
    case ServiceProvider.Google:
      return new ClientApi(ModelProvider.GeminiPro);
    case ServiceProvider.Anthropic:
      return new ClientApi(ModelProvider.Claude);
    case ServiceProvider.Baidu:
      return new ClientApi(ModelProvider.Ernie);
    case ServiceProvider.Volcengine:
      return new ClientApi(ModelProvider.Volcengine);
    case ServiceProvider.Alibaba:
      return new ClientApi(ModelProvider.Qwen);
    case ServiceProvider.Tencent:
      return new ClientApi(ModelProvider.Hunyuan);
    case ServiceProvider.Moonshot:
      return new ClientApi(ModelProvider.Moonshot);
    case ServiceProvider.Iflytek:
      return new ClientApi(ModelProvider.Iflytek);
    case ServiceProvider.DeepSeek:
      return new ClientApi(ModelProvider.DeepSeek);
    case ServiceProvider.XAI:
      return new ClientApi(ModelProvider.XAI);
    case ServiceProvider.ChatGLM:
      return new ClientApi(ModelProvider.ChatGLM);
    case ServiceProvider.SiliconFlow:
      return new ClientApi(ModelProvider.SiliconFlow);
    case ServiceProvider["302.AI"]:
      return new ClientApi(ModelProvider["302.AI"]);
    default:
      return new ClientApi(ModelProvider.GPT);
  }
}

export function getRouterClientApi(): ClientApi {
  return new ClientApi(ModelProvider.Router);
}
