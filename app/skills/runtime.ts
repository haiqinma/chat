import { LLMModel } from "../client/api";
import { Skill, getSkillApiTools } from "../store/skill";
import { ModelConfig } from "../store/config";
import {
  collectModelsWithDefaultModel,
  filterModelsByCandidates,
  matchesModelCandidate,
  normalizeModelCandidates,
} from "../utils/model";

export type SkillRuntimeStatus = "ready" | "needs_config" | "unavailable";

export type SkillRuntimeIssueType = "model" | "tool";

export type SkillRuntimeIssue = {
  type: SkillRuntimeIssueType;
  message: string;
};

export type SkillRuntimeResult = {
  status: SkillRuntimeStatus;
  issues: SkillRuntimeIssue[];
};

export function getSkillRuntimeStatusOrder(status: SkillRuntimeStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "needs_config":
      return 1;
    case "unavailable":
      return 2;
    default:
      return 3;
  }
}

export function getSkillRuntimeIssueSummary(result: SkillRuntimeResult) {
  return result.issues.map((issue) => issue.message).join(" · ");
}

export function resolveSkillRuntimeStatus(params: {
  skill: Skill;
  models: readonly LLMModel[];
  customModels?: string;
  accessCustomModels?: string;
  defaultModel?: string;
  globalModelConfig: ModelConfig;
  installedPluginIds?: readonly string[];
}): SkillRuntimeResult {
  const {
    skill,
    models,
    customModels,
    accessCustomModels,
    defaultModel,
    globalModelConfig,
    installedPluginIds,
  } = params;

  const runtimeModels = collectModelsWithDefaultModel(
    models,
    [customModels, accessCustomModels].filter(Boolean).join(","),
    defaultModel,
  ).filter((model) => model.available);
  const candidateModels = normalizeModelCandidates(skill.candidateModels);
  const sessionModels = filterModelsByCandidates(
    runtimeModels,
    candidateModels,
  );
  const shouldSyncFromGlobal = skill.syncGlobalConfig !== false;
  const nextModelConfig = shouldSyncFromGlobal
    ? { ...globalModelConfig }
    : {
        ...globalModelConfig,
        ...skill.modelConfig,
      };
  const hasCandidateModelRestriction = candidateModels.length > 0;
  const hasCurrentModel = sessionModels.some((model) =>
    matchesModelCandidate(model, {
      model: nextModelConfig.model,
      providerName: nextModelConfig.providerName,
    }),
  );
  const pluginIdSet = new Set(installedPluginIds ?? []);
  const missingPluginCount = getSkillApiTools(skill).filter(
    (id) => !pluginIdSet.has(id),
  ).length;

  const issues: SkillRuntimeIssue[] = [];

  if (runtimeModels.length === 0) {
    issues.push({
      type: "model",
      message: "当前没有任何可用模型",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (hasCandidateModelRestriction && sessionModels.length === 0) {
    issues.push({
      type: "model",
      message: "候选模型当前都不可用",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (!hasCurrentModel) {
    issues.push({
      type: "model",
      message: "默认模型需要调整",
    });
  }

  if (missingPluginCount > 0) {
    issues.push({
      type: "tool",
      message:
        missingPluginCount === 1
          ? "缺少 1 个工具配置"
          : `缺少 ${missingPluginCount} 个工具配置`,
    });
  }

  return {
    status: issues.length > 0 ? "needs_config" : "ready",
    issues,
  };
}
