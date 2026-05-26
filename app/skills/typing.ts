import { ModelConfig } from "../store";
import { type Skill } from "../store/skill";

export type BuiltinSkill = Omit<Skill, "id" | "modelConfig"> & {
  builtin: Boolean;
  modelConfig: Partial<ModelConfig>;
};

export type BuiltinMask = BuiltinSkill;
