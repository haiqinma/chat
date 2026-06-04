import { Skill } from "../store/skill";

import { type BuiltinSkill } from "./typing";
export { type BuiltinSkill, type BuiltinMask } from "./typing";
export {
  type LocalizedText,
  type SkillIcon,
  type SkillInstructions,
  type SkillLaunch,
  type SkillMcpServer,
  type SkillPackage,
  type SkillPackageModel,
  type SkillPermissions,
  type SkillRelease,
  type SkillTool,
  type SkillVisibility,
  resolveLocalizedText,
  skillPackageToSkill,
  skillToSkillPackage,
} from "./package";

export const BUILTIN_SKILL_ID = 100000;

export const BUILTIN_SKILL_STORE = {
  buildinId: BUILTIN_SKILL_ID,
  skills: {} as Record<string, BuiltinSkill>,
  get(id?: string) {
    if (!id) return undefined;
    return this.skills[id] as Skill | undefined;
  },
  add(skill: BuiltinSkill) {
    const savedSkill = { ...skill, id: this.buildinId++, builtin: true };
    this.skills[savedSkill.id] = savedSkill;
    return savedSkill;
  },
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [];

export const BUILTIN_MASK_ID = BUILTIN_SKILL_ID;
export const BUILTIN_MASK_STORE = BUILTIN_SKILL_STORE;
export const BUILTIN_MASKS = BUILTIN_SKILLS;

if (typeof window != "undefined") {
  // run in browser skip in next server
  fetch("/skills.json")
    .then((res) => res.json())
    .catch((error) => {
      console.error("[Fetch] failed to fetch skills", error);
      return { cn: [], en: [] };
    })
    .then((skills) => {
      const { cn = [], en = [] } = skills;
      return [...cn, ...en].map((skill) => {
        BUILTIN_SKILLS.push(BUILTIN_SKILL_STORE.add(skill));
      });
    });
}
