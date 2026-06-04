import fs from "fs";
import path from "path";
import { CN_SKILLS } from "./cn";
import { EN_SKILLS } from "./en";
import { skillToSkillPackage, type SkillPackage } from "./package";

import { type BuiltinSkill } from "./typing";

const BUILTIN_SKILLS: Record<string, BuiltinSkill[]> = {
  cn: CN_SKILLS,
  en: EN_SKILLS,
};

const BUILTIN_SKILL_PACKAGES: Record<string, SkillPackage[]> = {
  cn: CN_SKILLS.map((skill) => skillToSkillPackage(skill)),
  en: EN_SKILLS.map((skill) => skillToSkillPackage(skill)),
};

const dirname = path.dirname(__filename);

fs.writeFile(
  dirname + "/../../public/skills.json",
  JSON.stringify(BUILTIN_SKILLS, null, 4),
  function (error) {
    if (error) {
      console.error("[Build] failed to build skills", error);
    }
  },
);

fs.writeFile(
  dirname + "/../../public/skill-packages.json",
  JSON.stringify(BUILTIN_SKILL_PACKAGES, null, 4),
  function (error) {
    if (error) {
      console.error("[Build] failed to build skill packages", error);
    }
  },
);
