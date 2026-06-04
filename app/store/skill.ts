import { BUILTIN_SKILLS, BuiltinSkill } from "../skills";
import { getLang, Lang } from "../locales";
import { ModelCandidate } from "../client/api";
import { DEFAULT_TOPIC, ChatMessage } from "./chat";
import { ModelConfig, useAppConfig } from "./config";
import { StoreKey } from "../constant";
import { nanoid } from "nanoid";
import { createPersistStore } from "../utils/store";

export type Skill = {
  id: string;
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
  enableArtifacts?: boolean;
  enableCodeFold?: boolean;
  launch?: {
    type: "chat" | "sd";
  };
};

export const DEFAULT_SKILL_STATE = {
  skills: {} as Record<string, Skill>,
  language: undefined as Lang | undefined,
};

export type SkillState = typeof DEFAULT_SKILL_STATE & {
  skills: Record<string, Skill>;
  language?: Lang | undefined;
};

export const DEFAULT_SKILL_AVATAR = "gpt-bot";
export const createEmptySkill = () =>
  ({
    id: nanoid(),
    avatar: DEFAULT_SKILL_AVATAR,
    name: DEFAULT_TOPIC,
    context: [],
    syncGlobalConfig: true, // use global config as default
    modelConfig: { ...useAppConfig.getState().modelConfig },
    candidateModels: [],
    lang: getLang(),
    builtin: false,
    createdAt: Date.now(),
    plugin: [],
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
    skill.plugin?.length,
  );
}

export function getLaunchableSkills(skills: Skill[]) {
  return skills.filter(isLaunchableSkill);
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
    version: 4,

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
