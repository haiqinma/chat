import { Lang } from "../locales";
import { type ModelConfig } from "../store/config";
import {
  createDefaultRealtimeConfig,
  type RealtimeConfig,
} from "../store/realtime";
import { type ChatMessage } from "../store/chat";
import { type BuiltinSkill } from "./typing";
import type { SkillSessionToolbarConfig } from "../store/skill";

type BuiltinSkillInput = {
  avatar: string;
  name: string;
  description?: string;
  category?: string;
  starters?: string[];
  lang: Lang;
  createdAt: number;
  context: ChatMessage[];
  syncGlobalConfig?: boolean;
  candidateModels?: BuiltinSkill["candidateModels"];
  tools?: BuiltinSkill["tools"];
  toolStrategy?: BuiltinSkill["toolStrategy"];
  ui?: BuiltinSkill["ui"];
  launch?: BuiltinSkill["launch"];
  modelConfig?: Partial<ModelConfig>;
  realtimeConfig?: Partial<RealtimeConfig>;
};

const DEFAULT_MODEL_CONFIG: Partial<ModelConfig> = {
  temperature: 0.5,
  max_tokens: 4000,
  presence_penalty: 0,
  frequency_penalty: 0,
  sendMemory: true,
  historyMessageCount: 8,
  compressMessageLengthThreshold: 2000,
};

export const CHAT_TOOLBAR_PRESETS = {
  general: {
    settings: true,
    theme: true,
    promptHints: true,
    skillSwitcher: true,
    clearContext: true,
    modelSelector: true,
    imageUpload: true,
    imageParams: false,
    plugins: true,
    tools: true,
    shortcutKeys: true,
    realtime: false,
  },
  research: {
    settings: true,
    theme: true,
    promptHints: true,
    skillSwitcher: true,
    clearContext: true,
    modelSelector: true,
    imageUpload: true,
    imageParams: false,
    plugins: false,
    tools: true,
    shortcutKeys: true,
    realtime: false,
  },
  reasoning: {
    settings: true,
    theme: false,
    promptHints: true,
    skillSwitcher: true,
    clearContext: true,
    modelSelector: true,
    imageUpload: false,
    imageParams: false,
    plugins: false,
    tools: false,
    shortcutKeys: true,
    realtime: false,
  },
  image: {
    settings: false,
    theme: false,
    promptHints: true,
    skillSwitcher: true,
    clearContext: false,
    modelSelector: true,
    imageUpload: true,
    imageParams: true,
    plugins: false,
    tools: false,
    shortcutKeys: false,
    realtime: false,
  },
  realtime: {
    settings: true,
    theme: false,
    promptHints: false,
    skillSwitcher: true,
    clearContext: false,
    modelSelector: false,
    imageUpload: false,
    imageParams: false,
    plugins: false,
    tools: false,
    shortcutKeys: false,
    realtime: true,
  },
} satisfies Record<string, SkillSessionToolbarConfig>;

export function createBuiltinSkill(input: BuiltinSkillInput): BuiltinSkill {
  const { realtimeConfig, ...restInput } = input;
  return {
    ...restInput,
    builtin: true,
    hideContext: true,
    syncGlobalConfig: input.syncGlobalConfig ?? true,
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      ...input.modelConfig,
    },
    ...(realtimeConfig
      ? { realtimeConfig: createDefaultRealtimeConfig(realtimeConfig) }
      : {}),
  };
}

export const createBuiltinMask = createBuiltinSkill;
