import { BUILTIN_SKILLS, BuiltinSkill } from "../skills";
import { getLang, Lang } from "../locales";
import { ModelCandidate } from "../client/api";
import type { ChatMessage } from "./chat";
import { ModelConfig, useAppConfig } from "./config";
import { createDefaultRealtimeConfig, type RealtimeConfig } from "./realtime";
import { StoreKey } from "../constant";
import { nanoid } from "nanoid";
import { createPersistStore } from "../utils/store";
import {
  disablePlainChatReasoning,
  isLegacyPlainChatSkill,
} from "../utils/plain-chat";

export type BuiltInSkillToolType = "web_search";

export type SkillToolsConfig = {
  builtInTools?: BuiltInSkillToolType[];
  toolServers?: string[];
  toolRequirements?: Record<string, boolean>;
  apiTools?: string[];
};

export type SkillNativeToolBridgeMode = "auto" | "off";

export type SkillToolStrategy = {
  nativeToolBridge?: SkillNativeToolBridgeMode;
};

export type SkillSessionToolbarConfig = {
  settings?: boolean;
  theme?: boolean;
  promptHints?: boolean;
  skillSwitcher?: boolean;
  clearContext?: boolean;
  modelSelector?: boolean;
  imageUpload?: boolean;
  imageParams?: boolean;
  plugins?: boolean;
  tools?: boolean;
  shortcutKeys?: boolean;
  realtime?: boolean;
};

export type SkillUiConfig = {
  sessionToolbar?: SkillSessionToolbarConfig;
};

export type Skill = {
  id: string;
  packageId?: string;
  createdAt: number;
  avatar: string;
  name: string;
  description?: string;
  category?: string;
  starters?: string[];
  hideContext?: boolean;
  context: ChatMessage[];
  syncGlobalConfig?: boolean;
  modelConfig: ModelConfig;
  candidateModels?: ModelCandidate[];
  lang: Lang;
  builtin: boolean;
  plugin?: string[];
  tools?: SkillToolsConfig;
  toolStrategy?: SkillToolStrategy;
  ui?: SkillUiConfig;
  enableArtifacts?: boolean;
  enableCodeFold?: boolean;
  realtimeConfig?: RealtimeConfig;
  launch?: {
    type: "chat" | "sd";
  };
};

export const DEFAULT_SESSION_TOOLBAR: Required<SkillSessionToolbarConfig> = {
  settings: true,
  theme: true,
  promptHints: true,
  skillSwitcher: true,
  clearContext: true,
  modelSelector: true,
  imageUpload: true,
  imageParams: true,
  plugins: true,
  tools: true,
  shortcutKeys: true,
  realtime: false,
};

export function getSkillSessionToolbar(skill: Skill) {
  return {
    ...DEFAULT_SESSION_TOOLBAR,
    ...skill.ui?.sessionToolbar,
  };
}

export const DEFAULT_SKILL_STATE = {
  skills: {} as Record<string, Skill>,
  language: undefined as Lang | undefined,
};

const LEGACY_REMOVED_SKILL_NAMES = new Set(["高效助手", "Efficient Assistant"]);
export type SkillState = typeof DEFAULT_SKILL_STATE & {
  skills: Record<string, Skill>;
  language?: Lang | undefined;
};

export function removeLegacySkills(skills: Record<string, Skill>) {
  let removed = false;
  Object.entries(skills).forEach(([id, skill]) => {
    if (
      LEGACY_REMOVED_SKILL_NAMES.has(skill.name) ||
      isLegacyPlainChatSkill(skill)
    ) {
      delete skills[id];
      removed = true;
    }
  });
  return removed;
}

export const DEFAULT_SKILL_AVATAR = "gpt-bot";
const DEFAULT_EMPTY_SKILL_NAME = "通用问答";
export const createEmptySkill = (lang: Lang = getLang()) =>
  ({
    id: nanoid(),
    avatar: DEFAULT_SKILL_AVATAR,
    name: DEFAULT_EMPTY_SKILL_NAME,
    context: [],
    syncGlobalConfig: true, // use global config as default
    modelConfig: disablePlainChatReasoning(useAppConfig.getState().modelConfig),
    candidateModels: [],
    lang,
    builtin: false,
    createdAt: Date.now(),
    plugin: [],
    tools: {
      builtInTools: [],
      toolServers: [],
      toolRequirements: {},
      apiTools: [],
    },
    toolStrategy: {
      nativeToolBridge: "auto",
    },
    ui: {
      sessionToolbar: DEFAULT_SESSION_TOOLBAR,
    },
  }) as Skill;

function withBuiltinSkillConfig(skill: BuiltinSkill, modelConfig: ModelConfig) {
  return {
    ...skill,
    modelConfig: {
      ...modelConfig,
      ...skill.modelConfig,
    },
  } as Skill;
}

export function getBuiltinSkillsForLang(
  lang = getLang(),
  modelConfig = useAppConfig.getState().modelConfig,
) {
  const seen = new Set<string>();
  return BUILTIN_SKILLS.filter((item) => {
    if (item.lang !== lang || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  }).map((skill) => withBuiltinSkillConfig(skill, modelConfig));
}

export function isLaunchableSkill(skill: Skill) {
  if (skill.builtin) return true;

  return Boolean(
    skill.description ||
    skill.category ||
    skill.starters?.length ||
    skill.plugin?.length ||
    skill.tools?.builtInTools?.length ||
    skill.tools?.toolServers?.length ||
    skill.tools?.apiTools?.length,
  );
}

export function getLaunchableSkills(skills: Skill[]) {
  return skills.filter(isLaunchableSkill);
}

export function getSkillBuiltInTools(skill: Skill) {
  return skill.tools?.builtInTools ?? [];
}

export function getSkillToolServers(skill: Skill) {
  return skill.tools?.toolServers ?? [];
}

export function getRequiredSkillToolServers(skill: Skill) {
  return getSkillToolServers(skill).filter(
    (id) => skill.tools?.toolRequirements?.[id] !== false,
  );
}

export function getSkillApiTools(skill: Skill) {
  return skill.tools?.apiTools ?? skill.plugin ?? [];
}

export function getSkillNativeToolBridgeMode(skill: Skill) {
  return skill.toolStrategy?.nativeToolBridge ?? "auto";
}

export function allowSkillNativeToolBridge(skill: Skill) {
  return getSkillNativeToolBridgeMode(skill) !== "off";
}

export function syncSkillLegacyPlugin(skill: Skill) {
  const apiTools = skill.tools?.apiTools ?? skill.plugin ?? [];
  const toolServers = skill.tools?.toolServers ?? [];
  const existingToolRequirements = skill.tools?.toolRequirements ?? {};
  skill.plugin = apiTools;
  skill.tools = {
    builtInTools: skill.tools?.builtInTools ?? [],
    toolServers,
    toolRequirements: Object.fromEntries(
      toolServers.map((id) => [id, existingToolRequirements[id] ?? true]),
    ),
    apiTools,
  };
  skill.toolStrategy = {
    nativeToolBridge: skill.toolStrategy?.nativeToolBridge ?? "auto",
  };
  if (skill.realtimeConfig) {
    skill.realtimeConfig = createDefaultRealtimeConfig(skill.realtimeConfig);
  }
}

export const useSkillStore = createPersistStore(
  { ...DEFAULT_SKILL_STATE },

  (set, get) => ({
    create(skill?: Partial<Skill>) {
      const skills = get().skills;
      const id = nanoid();
      skills[id] = {
        ...createEmptySkill(),
        ...skill,
        id,
        builtin: false,
      };

      set(() => ({ skills }));
      get().markUpdate();

      return skills[id];
    },
    updateSkill(id: string, updater: (skill: Skill) => void) {
      const skills = get().skills;
      const skill = skills[id];
      if (!skill) return;
      const updatedSkill = { ...skill };
      updater(updatedSkill);
      skills[id] = updatedSkill;
      set(() => ({ skills }));
      get().markUpdate();
    },
    updateMask(id: string, updater: (skill: Skill) => void) {
      const skills = get().skills;
      const skill = skills[id];
      if (!skill) return;
      const updatedSkill = { ...skill };
      updater(updatedSkill);
      skills[id] = updatedSkill;
      set(() => ({ skills }));
      get().markUpdate();
    },
    delete(id: string) {
      const skills = get().skills;
      delete skills[id];
      set(() => ({ skills }));
      get().markUpdate();
    },

    get(id?: string) {
      return get().skills[id ?? 1145141919810];
    },
    getAll() {
      const userSkills = Object.values(get().skills).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      const config = useAppConfig.getState();
      if (config.hideBuiltinSkills) return userSkills;
      return userSkills.concat(
        getBuiltinSkillsForLang(getLang(), config.modelConfig),
      );
    },
    search(text: string) {
      return Object.values(get().skills);
    },
    setLanguage(language: Lang | undefined) {
      set({
        language,
      });
    },
  }),
  {
    name: StoreKey.Skill,
    version: 4.6,

    onRehydrateStorage() {
      return (state) => {
        if (!state?.skills) return;
        const skills = { ...state.skills };
        if (!removeLegacySkills(skills)) return;
        useSkillStore.setState({
          skills,
          lastUpdateTime: Date.now(),
        });
      };
    },

    migrate(state, version) {
      const legacyState = JSON.parse(JSON.stringify(state)) as SkillState & {
        masks?: Record<string, Skill>;
      };
      const newState = {
        ...legacyState,
        skills: legacyState.skills ?? legacyState.masks ?? {},
      } as SkillState;

      // migrate legacy skill id to nanoid
      if (version < 3) {
        Object.values(newState.skills).forEach((m) => (m.id = nanoid()));
      }

      if (version < 3.1) {
        const updatedSkills: Record<string, Skill> = {};
        Object.values(newState.skills).forEach((m) => {
          updatedSkills[m.id] = m;
        });
        newState.skills = updatedSkills;
      }

      if (version < 4.1) {
        removeLegacySkills(newState.skills);
      }

      if (version < 4.2) {
        Object.values(newState.skills).forEach((skill) => {
          syncSkillLegacyPlugin(skill);
        });
      }

      if (version < 4.6) {
        removeLegacySkills(newState.skills);
      }

      return newState as any;
    },
  },
);

export type Mask = Skill;
export type MaskState = SkillState & { masks?: Record<string, Skill> };
export const DEFAULT_MASK_STATE = DEFAULT_SKILL_STATE;
export const DEFAULT_MASK_AVATAR = DEFAULT_SKILL_AVATAR;
export const createEmptyMask = createEmptySkill;
export const useMaskStore = useSkillStore;
