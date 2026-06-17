import { Lang } from "../locales";
import { type ModelConfig } from "../store/config";
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
    mcp: true,
    shortcutKeys: true,
    realtime: true,
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
    mcp: true,
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
    mcp: false,
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
    mcp: false,
    shortcutKeys: false,
    realtime: false,
  },
} satisfies Record<string, SkillSessionToolbarConfig>;

export function createBuiltinSkill(input: BuiltinSkillInput): BuiltinSkill {
  return {
    ...input,
    builtin: true,
    hideContext: true,
    syncGlobalConfig: input.syncGlobalConfig ?? true,
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      ...input.modelConfig,
    },
  };
}

export const createBuiltinMask = createBuiltinSkill;
