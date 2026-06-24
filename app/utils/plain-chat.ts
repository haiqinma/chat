import type { ModelConfig } from "../store/config";
import type { Skill } from "../store/skill";

export function disablePlainChatReasoning(modelConfig: ModelConfig) {
  return {
    ...modelConfig,
    reasoningMode: "off" as const,
    reasoningEffort: modelConfig.reasoningEffort ?? "medium",
  };
}

export function isPlainChatSkill(skill: Skill) {
  return (
    !skill.builtin &&
    !skill.description &&
    !skill.category &&
    !skill.starters?.length &&
    !skill.context?.length &&
    !skill.plugin?.length &&
    !skill.tools?.builtInTools?.length &&
    !skill.tools?.toolServers?.length &&
    !skill.tools?.apiTools?.length &&
    !skill.launch
  );
}

export const LEGACY_PLAIN_CHAT_SKILL_NAMES = new Set([
  "新的聊天",
  "New Conversation",
]);

export function isLegacyPlainChatSkill(skill: Skill) {
  const builtInTools = skill.tools?.builtInTools ?? [];

  return (
    LEGACY_PLAIN_CHAT_SKILL_NAMES.has(skill.name) &&
    !skill.builtin &&
    !skill.packageId &&
    !skill.description &&
    !skill.category &&
    !skill.starters?.length &&
    !skill.context?.length &&
    !skill.plugin?.length &&
    !skill.tools?.toolServers?.length &&
    !skill.tools?.apiTools?.length &&
    !skill.launch &&
    builtInTools.every((tool) => tool === "web_search")
  );
}
