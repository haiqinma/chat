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
  isPlainChatLikeSkill,
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
  const toolbar = {
    ...DEFAULT_SESSION_TOOLBAR,
    ...skill.ui?.sessionToolbar,
  };

  if (isPlainChatLikeSkill(skill)) {
    toolbar.plugins = false;
    toolbar.tools = false;
  }

  return toolbar;
}

export const DEFAULT_SKILL_STATE = {
  skills: {} as Record<string, Skill>,
  builtinOverrides: {} as Record<string, Skill>,
  language: undefined as Lang | undefined,
};

const LEGACY_REMOVED_SKILL_NAMES = new Set(["高效助手", "Efficient Assistant"]);
const RETIRED_BUILTIN_SKILL_KEYS = new Set([
  "cn:1700000001002:网页调研",
  "cn:1700000001003:阅读总结",
  "cn:1700000001004:方案对比",
  "en:1700000002002:Web Research",
  "en:1700000002003:Read and Summarize",
  "en:1700000002004:Compare Options",
]);
export type SkillState = typeof DEFAULT_SKILL_STATE & {
  skills: Record<string, Skill>;
  builtinOverrides: Record<string, Skill>;
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

function getSkillRetirementKey(
  skill: Pick<Skill, "lang" | "createdAt" | "name">,
) {
  return `${skill.lang}:${skill.createdAt}:${skill.name}`;
}

export function removeRetiredBuiltinOverrides(skills: Record<string, Skill>) {
  let removed = false;
  Object.entries(skills).forEach(([id, skill]) => {
    if (!isBuiltinSkillOverride(skill)) return;
    if (!RETIRED_BUILTIN_SKILL_KEYS.has(getSkillRetirementKey(skill))) return;
    delete skills[id];
    removed = true;
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

export function getBuiltinSkillPackageId(
  skill: Pick<Skill, "lang" | "createdAt">,
) {
  return `builtin.${skill.lang}.${skill.createdAt}`;
}

export function isBuiltinSkillOverride(
  skill: Pick<Skill, "builtin" | "packageId" | "lang" | "createdAt">,
) {
  return !skill.builtin && skill.packageId === getBuiltinSkillPackageId(skill);
}

export function getStoredUserSkills(
  state: Pick<SkillState, "skills" | "builtinOverrides">,
) {
  const merged = new Map<string, Skill>();
  Object.values(state.skills).forEach((skill) => {
    merged.set(skill.id, skill);
  });
  Object.values(state.builtinOverrides).forEach((skill) => {
    merged.set(skill.id, skill);
  });
  return Array.from(merged.values());
}

function resolveSkillBucket(
  state: Pick<SkillState, "skills" | "builtinOverrides">,
  skill?: Partial<Skill>,
) {
  if (skill && isBuiltinSkillOverride(skill as Skill)) {
    return "builtinOverrides" as const;
  }
  return "skills" as const;
}

export function mergeVisibleSkills(params: {
  userSkills: Skill[];
  hideBuiltinSkills?: boolean;
  lang?: Lang;
  modelConfig?: ModelConfig;
}) {
  const {
    userSkills,
    hideBuiltinSkills,
    lang = getLang(),
    modelConfig = useAppConfig.getState().modelConfig,
  } = params;

  const sortedUserSkills = userSkills
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  if (hideBuiltinSkills) return sortedUserSkills;

  const enabledPackageIds = new Set(
    sortedUserSkills.map((skill) => skill.packageId).filter(Boolean),
  );
  const builtinSkills = getBuiltinSkillsForLang(lang, modelConfig)
    .filter((skill) => !enabledPackageIds.has(getBuiltinSkillPackageId(skill)))
    .map((skill) => ({
      ...skill,
      packageId: getBuiltinSkillPackageId(skill),
    }));

  return [...sortedUserSkills, ...builtinSkills];
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
      const bucket = resolveSkillBucket(get(), skill);
      const records = get()[bucket];
      const id = nanoid();
      records[id] = {
        ...createEmptySkill(),
        ...skill,
        id,
        builtin: false,
      };

      set(() => ({ [bucket]: records }));
      get().markUpdate();

      return records[id];
    },
    updateSkill(id: string, updater: (skill: Skill) => void) {
      const bucket =
        get().skills[id] !== undefined ? "skills" : "builtinOverrides";
      const records = get()[bucket];
      const skill = records[id];
      if (!skill) return;
      const updatedSkill = { ...skill };
      updater(updatedSkill);
      records[id] = updatedSkill;
      set(() => ({ [bucket]: records }));
      get().markUpdate();
    },
    delete(id: string) {
      if (get().skills[id] !== undefined) {
        const skills = get().skills;
        delete skills[id];
        set(() => ({ skills }));
      } else {
        const builtinOverrides = get().builtinOverrides;
        delete builtinOverrides[id];
        set(() => ({ builtinOverrides }));
      }
      get().markUpdate();
    },

    get(id?: string) {
      const key = id ?? "1145141919810";
      return get().skills[key] ?? get().builtinOverrides[key];
    },
    getAll() {
      const config = useAppConfig.getState();
      return mergeVisibleSkills({
        userSkills: getStoredUserSkills(get()),
        hideBuiltinSkills: config.hideBuiltinSkills,
        lang: getLang(),
        modelConfig: config.modelConfig,
      });
    },
    search(text: string) {
      return getStoredUserSkills(get());
    },
    setLanguage(language: Lang | undefined) {
      set({
        language,
      });
    },
  }),
  {
    name: StoreKey.Skill,
    version: 4.8,

    onRehydrateStorage() {
      return (state) => {
        if (!state?.skills && !state?.builtinOverrides) return;
        const skills = { ...state.skills };
        const builtinOverrides = { ...(state.builtinOverrides ?? {}) };
        const removedSkills = removeLegacySkills(skills);
        const removedLegacyOverrides = removeLegacySkills(builtinOverrides);
        const removedRetiredOverrides =
          removeRetiredBuiltinOverrides(builtinOverrides);
        if (
          !removedSkills &&
          !removedLegacyOverrides &&
          !removedRetiredOverrides
        ) {
          return;
        }
        useSkillStore.setState({
          skills,
          builtinOverrides,
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
        builtinOverrides: legacyState.builtinOverrides ?? {},
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

      if (version < 4.7) {
        Object.entries(newState.skills).forEach(([id, skill]) => {
          if (!isBuiltinSkillOverride(skill)) return;
          newState.builtinOverrides[id] = skill;
          delete newState.skills[id];
        });
        removeLegacySkills(newState.builtinOverrides);
      }

      if (version < 4.8) {
        removeRetiredBuiltinOverrides(newState.builtinOverrides);
      }

      return newState as any;
    },
  },
);
