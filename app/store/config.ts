import type { LLMModel } from "../client/api";
import { DalleStyle, ImageQuality, ModelSize } from "../typing";
import { getClientConfig } from "../config/client";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_ENGINES,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_MODELS,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_VOICES,
  StoreKey,
  ServiceProvider,
} from "../constant";
import { createPersistStore } from "../utils/store";
import { normalizeModels, normalizeProviderName } from "../utils/model";
import type { ReasoningEffort, ReasoningMode } from "../client/reasoning";
import type { ResponsesConversationMode } from "../client/api";
import {
  createDefaultRealtimeConfig,
  type LegacyRealtimeConfig,
} from "./realtime";

export type ModelType = string;
export type TTSModelType = (typeof DEFAULT_TTS_MODELS)[number];
export type TTSVoiceType = (typeof DEFAULT_TTS_VOICES)[number];
export type TTSEngineType = (typeof DEFAULT_TTS_ENGINES)[number];

export enum SubmitKey {
  Enter = "Enter",
  CtrlEnter = "Ctrl + Enter",
  ShiftEnter = "Shift + Enter",
  AltEnter = "Alt + Enter",
  MetaEnter = "Meta + Enter",
}

export enum Theme {
  Auto = "auto",
  Dark = "dark",
  Light = "light",
}

export const createDefaultConfig = () => {
  const config = getClientConfig();

  return {
    lastUpdate: Date.now(), // timestamp, to merge state

    submitKey: SubmitKey.Enter,
    avatar: "1f603",
    fontSize: 14,
    fontFamily: "",
    theme: Theme.Auto as Theme,
    tightBorder: !!config?.isApp,
    sendPreviewBubble: true,
    enableAutoGenerateTitle: true,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

    enableArtifacts: true, // show artifacts config

    enableCodeFold: true, // code fold config

    disablePromptHint: false,

    dontShowMaskSplashScreen: false, // dont show skill picker when create chat
    hideBuiltinSkills: false, // dont add builtin skills

    customModels: "",
    models: [] as LLMModel[],

    modelConfig: {
      model: "gpt-5.1" as ModelType,
      providerName: "OpenAI" as ServiceProvider,
      temperature: 0.5,
      top_p: 1,
      max_tokens: 4000,
      presence_penalty: 0,
      frequency_penalty: 0,
      reasoningMode: "off" as ReasoningMode,
      reasoningEffort: "medium" as ReasoningEffort,
      endpointPath: undefined as string | undefined,
      supportedEndpoints: undefined as string[] | undefined,
      ownedBy: undefined as string | undefined,
      tags: undefined as string[] | undefined,
      responsesMode: undefined as ResponsesConversationMode | undefined,
      sendMemory: true,
      historyMessageCount: 4,
      compressMessageLengthThreshold: 1000,
      compressModel: "",
      compressProviderName: "",
      enableInjectSystemPrompts: true,
      template: config?.template ?? DEFAULT_INPUT_TEMPLATE,
      size: "1024x1024" as ModelSize,
      quality: "auto" as ImageQuality,
      style: "vivid" as DalleStyle,
    },

    ttsConfig: {
      enable: false,
      autoplay: false,
      engine: DEFAULT_TTS_ENGINE,
      model: DEFAULT_TTS_MODEL,
      voice: DEFAULT_TTS_VOICE,
      speed: 1.0,
    },

    realtimeConfig: createDefaultRealtimeConfig(),
  };
};

export const DEFAULT_CONFIG = createDefaultConfig();

export type ChatConfig = typeof DEFAULT_CONFIG;

export type ModelConfig = ChatConfig["modelConfig"];
export type TTSConfig = ChatConfig["ttsConfig"];

export function limitNumber(
  x: number,
  min: number,
  max: number,
  defaultValue: number,
) {
  if (isNaN(x)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, x));
}

export const TTSConfigValidator = {
  engine(x: string) {
    return x as TTSEngineType;
  },
  model(x: string) {
    return x as TTSModelType;
  },
  voice(x: string) {
    return x as TTSVoiceType;
  },
  speed(x: number) {
    return limitNumber(x, 0.25, 4.0, 1.0);
  },
};

export const ModalConfigValidator = {
  model(x: string) {
    return x as ModelType;
  },
  max_tokens(x: number) {
    return limitNumber(x, 0, 512000, 1024);
  },
  presence_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  frequency_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  temperature(x: number) {
    return limitNumber(x, 0, 2, 1);
  },
  top_p(x: number) {
    return limitNumber(x, 0, 1, 1);
  },
};

export const useAppConfig = createPersistStore(
  { ...createDefaultConfig() },
  (set, get) => ({
    reset() {
      set(() => ({ ...createDefaultConfig() }));
    },

    mergeModels(newModels: LLMModel[]) {
      if (!newModels || newModels.length === 0) {
        return;
      }

      const oldModels = normalizeModels(get().models);
      const normalizedNewModels = normalizeModels(newModels);
      const modelMap: Record<string, LLMModel> = {};

      for (const model of oldModels) {
        model.available = false;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      for (const model of normalizedNewModels) {
        model.available = true;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      set(() => ({
        models: Object.values(modelMap),
      }));
    },

    allModels() {},
  }),
  {
    name: StoreKey.Config,
    version: 4.6,

    merge(persistedState, currentState) {
      const state = persistedState as ChatConfig | undefined;
      if (!state) return { ...currentState };

      const models = normalizeModels(currentState.models.slice());
      normalizeModels(state.models ?? []).forEach((pModel) => {
        const idx = models.findIndex(
          (v) =>
            v.name === pModel.name && v.provider?.id === pModel.provider?.id,
        );
        if (idx !== -1) models[idx] = pModel;
        else models.push(pModel);
      });

      const providerName =
        normalizeProviderName(state.modelConfig?.providerName) ??
        currentState.modelConfig.providerName;
      const compressProviderName =
        normalizeProviderName(state.modelConfig?.compressProviderName) ??
        state.modelConfig?.compressProviderName;

      if (state.modelConfig?.providerName !== providerName) {
        console.info("[Config] normalized providerName in persisted config", {
          from: state.modelConfig?.providerName,
          to: providerName,
        });
      }

      return {
        ...currentState,
        ...state,
        models,
        modelConfig: {
          ...currentState.modelConfig,
          ...state.modelConfig,
          providerName: providerName as ServiceProvider,
          compressProviderName: compressProviderName as any,
        },
        realtimeConfig: createDefaultRealtimeConfig(
          state.realtimeConfig as LegacyRealtimeConfig,
        ),
      };
    },

    migrate(persistedState, version) {
      const state = persistedState as ChatConfig;

      if (version < 3.4) {
        state.modelConfig.sendMemory = true;
        state.modelConfig.historyMessageCount = 4;
        state.modelConfig.compressMessageLengthThreshold = 1000;
        state.modelConfig.frequency_penalty = 0;
        state.modelConfig.top_p = 1;
        state.modelConfig.template = DEFAULT_INPUT_TEMPLATE;
        state.dontShowMaskSplashScreen = false;
        state.hideBuiltinSkills = false;
      }

      const legacyState = state as ChatConfig & { hideBuiltinMasks?: boolean };
      if (legacyState.hideBuiltinSkills === undefined) {
        legacyState.hideBuiltinSkills = legacyState.hideBuiltinMasks ?? false;
      }

      if (version < 3.5) {
        state.customModels = "claude,claude-100k";
      }

      if (version < 3.6) {
        state.modelConfig.enableInjectSystemPrompts = true;
      }

      if (version < 3.7) {
        state.enableAutoGenerateTitle = true;
      }

      if (version < 3.8) {
        state.lastUpdate = Date.now();
      }

      if (version < 3.9) {
        const runtimeConfig = getClientConfig();
        state.modelConfig.template =
          state.modelConfig.template !== DEFAULT_INPUT_TEMPLATE
            ? state.modelConfig.template
            : (runtimeConfig?.template ?? DEFAULT_INPUT_TEMPLATE);
      }

      if (version < 4.1) {
        state.modelConfig.compressModel =
          DEFAULT_CONFIG.modelConfig.compressModel;
        state.modelConfig.compressProviderName =
          DEFAULT_CONFIG.modelConfig.compressProviderName;
      }

      const ensureModels = () => {
        if (!state.models || !Array.isArray(state.models)) {
          state.models = [];
        }
      };

      if (version < 4.2) {
        ensureModels();
        if (!state.modelConfig.model) {
          state.modelConfig.model = DEFAULT_CONFIG.modelConfig.model;
        }
        if (!state.modelConfig.providerName) {
          state.modelConfig.providerName =
            DEFAULT_CONFIG.modelConfig.providerName;
        }
      }

      if (version < 4.3) {
        ensureModels();
      }

      if (version < 4.4) {
        ensureModels();
        if (!state.modelConfig.model) {
          state.modelConfig.model = DEFAULT_CONFIG.modelConfig.model;
        }
        if (!state.modelConfig.providerName) {
          state.modelConfig.providerName =
            DEFAULT_CONFIG.modelConfig.providerName;
        }
      }

      if (version < 4.5) {
        // keep existing list; router will refresh after login
        ensureModels();
        if (!state.modelConfig.model) {
          state.modelConfig.model = DEFAULT_CONFIG.modelConfig.model;
        }
        if (!state.modelConfig.providerName) {
          state.modelConfig.providerName =
            DEFAULT_CONFIG.modelConfig.providerName;
        }
      }

      if (version < 4.6) {
        ensureModels();
      }

      state.models = normalizeModels(state.models ?? []);
      state.realtimeConfig = createDefaultRealtimeConfig(
        state.realtimeConfig as LegacyRealtimeConfig,
      );
      state.modelConfig.providerName = (normalizeProviderName(
        state.modelConfig.providerName,
      ) ?? DEFAULT_CONFIG.modelConfig.providerName) as ServiceProvider;
      state.modelConfig.compressProviderName = (normalizeProviderName(
        state.modelConfig.compressProviderName,
      ) ?? state.modelConfig.compressProviderName) as any;

      console.info("[Config] migrate normalized model providers", {
        providerName: state.modelConfig.providerName,
        compressProviderName: state.modelConfig.compressProviderName,
        modelCount: state.models.length,
      });

      return state as any;
    },
  },
);
