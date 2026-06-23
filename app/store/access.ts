import {
  GoogleSafetySettingsThreshold,
  ServiceProvider,
  StoreKey,
  ApiPath,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  BAIDU_BASE_URL,
  VOLCENGINE_BASE_URL,
  ALIBABA_BASE_URL,
  TENCENT_BASE_URL,
  MOONSHOT_BASE_URL,
  STABILITY_BASE_URL,
  IFLYTEK_BASE_URL,
  DEEPSEEK_BASE_URL,
  XAI_BASE_URL,
  CHATGLM_BASE_URL,
  SILICONFLOW_BASE_URL,
  AI302_BASE_URL,
} from "../constant";
import { getHeaders } from "../client/api";
import { getClientConfig, setClientConfig } from "../config/client";
import type { RuntimePublicConfig } from "../config/runtime";
import { createPersistStore } from "../utils/store";
import { ensure } from "../utils/clone";
import { DEFAULT_CONFIG } from "./config";
import { getModelProvider } from "../utils/model";
import { getUcanRootCapsKey } from "../plugins/ucan";
import { isCentralUcanAuthorized } from "../plugins/central-ucan";

let fetchState = 0; // 0 not fetch, 1 fetching, 2 done

// Default router endpoint for OpenAI-compatible requests
const normalizeUrl = (value: string) => value.replace(/\/+$/, "");

const isApp = () => getClientConfig()?.buildMode === "export";
const getDefaultOpenAIUrl = () =>
  normalizeUrl(
    getClientConfig()?.routerBackendUrl?.trim() || "https://llm.yeying.pub",
  );
const LEGACY_OPENAI_URL = "https://shengnw.win";
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

const getRouterBackendUrl = () =>
  normalizeUrl(
    getClientConfig()?.routerBackendUrl?.trim() || "https://llm.yeying.pub",
  );

const isValidUcanMeta = (): boolean => {
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
};

const isRouterEndpoint = (url: string | undefined): boolean => {
  if (!url) return false;
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
};

const createDefaultAccessState = () => {
  const isExportApp = isApp();
  const defaultOpenAIUrl = getDefaultOpenAIUrl();

  return {
    accessCode: "",
    useCustomConfig: true,

    provider: ServiceProvider.OpenAI,

    // openai
    openaiUrl: defaultOpenAIUrl,
    openaiApiKey: "",
    selectedRouterToken: "",
    routerBackendUrlSnapshot: defaultOpenAIUrl,

    // azure
    azureUrl: "",
    azureApiKey: "",
    azureApiVersion: "2023-08-01-preview",

    // google ai studio
    googleUrl: isExportApp ? GEMINI_BASE_URL : ApiPath.Google,
    googleApiKey: "",
    googleApiVersion: "v1",
    googleSafetySettings: GoogleSafetySettingsThreshold.BLOCK_ONLY_HIGH,

    // anthropic
    anthropicUrl: isExportApp ? ANTHROPIC_BASE_URL : ApiPath.Anthropic,
    anthropicApiKey: "",
    anthropicApiVersion: "2023-06-01",

    // baidu
    baiduUrl: isExportApp ? BAIDU_BASE_URL : ApiPath.Baidu,
    baiduApiKey: "",
    baiduSecretKey: "",

    // volcengine
    volcengineUrl: isExportApp ? VOLCENGINE_BASE_URL : ApiPath.Volcengine,
    volcengineApiKey: "",

    // alibaba
    alibabaUrl: isExportApp ? ALIBABA_BASE_URL : ApiPath.Alibaba,
    alibabaApiKey: "",

    // moonshot
    moonshotUrl: isExportApp ? MOONSHOT_BASE_URL : ApiPath.Moonshot,
    moonshotApiKey: "",

    //stability
    stabilityUrl: isExportApp ? STABILITY_BASE_URL : ApiPath.Stability,
    stabilityApiKey: "",

    // tencent
    tencentUrl: isExportApp ? TENCENT_BASE_URL : ApiPath.Tencent,
    tencentSecretKey: "",
    tencentSecretId: "",

    // iflytek
    iflytekUrl: isExportApp ? IFLYTEK_BASE_URL : ApiPath.Iflytek,
    iflytekApiKey: "",
    iflytekApiSecret: "",

    // deepseek
    deepseekUrl: isExportApp ? DEEPSEEK_BASE_URL : ApiPath.DeepSeek,
    deepseekApiKey: "",

    // xai
    xaiUrl: isExportApp ? XAI_BASE_URL : ApiPath.XAI,
    xaiApiKey: "",

    // chatglm
    chatglmUrl: isExportApp ? CHATGLM_BASE_URL : ApiPath.ChatGLM,
    chatglmApiKey: "",

    // siliconflow
    siliconflowUrl: isExportApp ? SILICONFLOW_BASE_URL : ApiPath.SiliconFlow,
    siliconflowApiKey: "",

    // 302.AI
    ai302Url: isExportApp ? AI302_BASE_URL : ApiPath["302.AI"],
    ai302ApiKey: "",

    // server config
    needCode: true,
    hideUserApiKey: false,
    hideBalanceQuery: false,
    disableGPT4: false,
    disableFastLink: false,
    customModels: "",
    defaultModel: "",
    visionModels: "",

    // tts config
    edgeTTSVoiceName: "zh-CN-YunxiNeural",
  };
};

const DEFAULT_ACCESS_STATE = createDefaultAccessState();

const syncRouterBackendUrlSnapshot = (state: typeof DEFAULT_ACCESS_STATE) => {
  const routerBackendUrl = getRouterBackendUrl();
  const normalizedOpenAIUrl = normalizeUrl(state.openaiUrl || "");
  const normalizedSnapshot = normalizeUrl(state.routerBackendUrlSnapshot || "");
  const isDefaultLike =
    normalizedOpenAIUrl === "" ||
    normalizedOpenAIUrl === ApiPath.OpenAI ||
    normalizedOpenAIUrl === normalizeUrl(OPENAI_BASE_URL) ||
    normalizedOpenAIUrl === normalizeUrl(LEGACY_OPENAI_URL) ||
    normalizedOpenAIUrl.includes("llm.yeying.pub");

  if (
    normalizedOpenAIUrl === normalizedSnapshot ||
    (normalizedSnapshot === "" && isDefaultLike)
  ) {
    state.openaiUrl = routerBackendUrl;
  }

  state.routerBackendUrlSnapshot = routerBackendUrl;
};

export const useAccessStore = createPersistStore(
  { ...DEFAULT_ACCESS_STATE },

  (set, get) => ({
    enabledAccessControl() {
      return get().needCode;
    },
    getVisionModels() {
      return get().visionModels;
    },
    edgeVoiceName() {
      return get().edgeTTSVoiceName;
    },

    isValidOpenAI() {
      return ensure(get(), ["openaiApiKey"]);
    },

    isValidAzure() {
      return ensure(get(), ["azureUrl", "azureApiKey", "azureApiVersion"]);
    },

    isValidGoogle() {
      return ensure(get(), ["googleApiKey"]);
    },

    isValidAnthropic() {
      return ensure(get(), ["anthropicApiKey"]);
    },

    isValidBaidu() {
      return ensure(get(), ["baiduApiKey", "baiduSecretKey"]);
    },

    isValidVolcengine() {
      return ensure(get(), ["volcengineApiKey"]);
    },

    isValidAlibaba() {
      return ensure(get(), ["alibabaApiKey"]);
    },

    isValidTencent() {
      return ensure(get(), ["tencentSecretKey", "tencentSecretId"]);
    },

    isValidMoonshot() {
      return ensure(get(), ["moonshotApiKey"]);
    },
    isValidIflytek() {
      return ensure(get(), ["iflytekApiKey"]);
    },
    isValidDeepSeek() {
      return ensure(get(), ["deepseekApiKey"]);
    },

    isValidXAI() {
      return ensure(get(), ["xaiApiKey"]);
    },

    isValidChatGLM() {
      return ensure(get(), ["chatglmApiKey"]);
    },

    isValidSiliconFlow() {
      return ensure(get(), ["siliconflowApiKey"]);
    },

    isAuthorized() {
      // has token or has code or disabled access control
      const routerJwtOk =
        typeof window !== "undefined" &&
        isRouterEndpoint(get().openaiUrl) &&
        (isValidUcanMeta() || isCentralUcanAuthorized());

      return (
        this.isValidOpenAI() ||
        this.isValidAzure() ||
        this.isValidGoogle() ||
        this.isValidAnthropic() ||
        this.isValidBaidu() ||
        this.isValidVolcengine() ||
        this.isValidAlibaba() ||
        this.isValidTencent() ||
        this.isValidMoonshot() ||
        this.isValidIflytek() ||
        this.isValidDeepSeek() ||
        this.isValidXAI() ||
        this.isValidChatGLM() ||
        this.isValidSiliconFlow() ||
        routerJwtOk ||
        !this.enabledAccessControl() ||
        (this.enabledAccessControl() && ensure(get(), ["accessCode"]))
      );
    },
    fetch() {
      if (fetchState > 0 || getClientConfig()?.buildMode === "export") return;
      fetchState = 1;
      fetch("/api/config", {
        method: "post",
        body: null,
        headers: {
          ...getHeaders(),
        },
      })
        .then((res) => res.json())
        .then((res) => {
          const defaultModel = res.defaultModel ?? "";
          if (defaultModel !== "") {
            const [model, providerName] = getModelProvider(defaultModel);
            DEFAULT_CONFIG.modelConfig.model = model;
            DEFAULT_CONFIG.modelConfig.providerName = providerName as any;
          }

          return res;
        })
        .then((res: RuntimePublicConfig) => {
          setClientConfig(res);
          console.log("[Config] got config from server", res);
          set((state) => ({
            ...state,
            needCode: res.needCode,
            hideUserApiKey: res.hideUserApiKey,
            hideBalanceQuery: res.hideBalanceQuery,
            disableGPT4: res.disableGPT4,
            disableFastLink: res.disableFastLink,
            customModels: res.customModels,
            defaultModel: res.defaultModel,
            visionModels: res.visionModels,
            // keep router defaults if server config doesn't specify
            useCustomConfig: true,
            provider: ServiceProvider.OpenAI,
            openaiUrl: state.openaiUrl || getDefaultOpenAIUrl(),
          }));
        })
        .catch(() => {
          console.error("[Config] failed to fetch config");
        })
        .finally(() => {
          fetchState = 2;
        });
    },
  }),
  {
    name: StoreKey.Access,
    version: 8,
    migrate(persistedState, version) {
      if (version < 2) {
        const state = persistedState as {
          token: string;
          openaiApiKey: string;
          azureApiVersion: string;
          googleApiKey: string;
        };
        state.openaiApiKey = state.token;
        state.azureApiVersion = "2023-08-01-preview";
      }

      if (version < 3) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.useCustomConfig = true;
        state.provider = ServiceProvider.OpenAI;

        const shouldReplaceOpenAIUrl =
          state.openaiUrl === ApiPath.OpenAI ||
          state.openaiUrl === OPENAI_BASE_URL;

        if (!state.openaiUrl || shouldReplaceOpenAIUrl) {
          state.openaiUrl = getDefaultOpenAIUrl();
        }
      }

      if (version < 4) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.useCustomConfig = true;
        state.provider = ServiceProvider.OpenAI;
        state.openaiUrl = getDefaultOpenAIUrl();
      }

      if (version < 5) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        const normalizedOpenAIUrl = normalizeUrl(state.openaiUrl || "");
        const shouldReplaceOpenAIUrl =
          normalizedOpenAIUrl.length === 0 ||
          normalizedOpenAIUrl === ApiPath.OpenAI ||
          normalizedOpenAIUrl === normalizeUrl(OPENAI_BASE_URL) ||
          normalizedOpenAIUrl === normalizeUrl(LEGACY_OPENAI_URL);

        if (shouldReplaceOpenAIUrl) {
          state.openaiUrl = getDefaultOpenAIUrl();
        }
      }

      if (version < 6) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.routerBackendUrlSnapshot = "";
      }

      if (version < 7) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.selectedRouterToken = "";
      }

      if (version < 8) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE & {
          selectedRouterTokenId?: string;
        };
        state.selectedRouterToken =
          typeof state.selectedRouterToken === "string"
            ? state.selectedRouterToken
            : typeof state.selectedRouterTokenId === "string"
              ? state.selectedRouterTokenId
              : "";
        delete (state as { selectedRouterTokenId?: string })
          .selectedRouterTokenId;
      }

      return persistedState as any;
    },
  },
);

let hasAccessHydrationSubscription = false;

if (typeof window !== "undefined" && !hasAccessHydrationSubscription) {
  hasAccessHydrationSubscription = true;
  const syncOnHydrate = () => {
    useAccessStore.getState().update((state) => {
      syncRouterBackendUrlSnapshot(state);
    });
  };

  if (useAccessStore.getState()._hasHydrated) {
    syncOnHydrate();
  } else {
    useAccessStore.subscribe((state, prevState) => {
      if (!prevState._hasHydrated && state._hasHydrated) {
        syncOnHydrate();
      }
    });
  }
}
