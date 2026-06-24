import { LLMModel } from "../client/api";
import { ModelConfig } from "../store/config";
import { ServerStatusResponse } from "../tools/types";
import { useAccessStore } from "../store/access";
import {
  getRequiredSkillToolServers,
  getSkillSessionToolbar,
  type Skill,
} from "../store/skill";
import { isRouterRealtimeProvider } from "../store/realtime";
import {
  collectModelsWithDefaultModel,
  filterModelsByCandidates,
  matchesModelCandidate,
  normalizeModelCandidates,
} from "../utils/model";

export type SkillRuntimeStatus = "ready" | "needs_config" | "unavailable";

export type SkillRuntimeIssueType =
  | "model"
  | "api_tool"
  | "tool_missing"
  | "tool_inactive"
  | "realtime";

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

export function hasSkillToolRuntimeIssue(result?: SkillRuntimeResult) {
  return (
    result?.issues.some(
      (issue) =>
        issue.type === "tool_missing" || issue.type === "tool_inactive",
    ) ?? false
  );
}

function getSkillApiTools(skill: Skill) {
  return skill.tools?.apiTools ?? skill.plugin ?? [];
}

function hasRouterRealtimeToken(apiKey?: string) {
  if (apiKey?.trim()) return true;
  const accessStore = useAccessStore.getState();
  return Boolean(
    accessStore.selectedRouterToken?.trim() ||
    accessStore.openaiApiKey?.trim() ||
    (accessStore.enabledAccessControl() && accessStore.accessCode?.trim()),
  );
}

export function resolveSkillRuntimeStatus(params: {
  skill: Skill;
  models: readonly LLMModel[];
  customModels?: string;
  accessCustomModels?: string;
  defaultModel?: string;
  globalModelConfig: ModelConfig;
  installedPluginIds?: readonly string[];
  installedToolServerIds?: readonly string[];
  toolStatuses?: Record<string, ServerStatusResponse | undefined>;
}): SkillRuntimeResult {
  const {
    skill,
    models,
    customModels,
    accessCustomModels,
    defaultModel,
    globalModelConfig,
    installedPluginIds,
    installedToolServerIds,
    toolStatuses,
  } = params;

  const runtimeModels = collectModelsWithDefaultModel(
    models,
    [customModels, accessCustomModels].filter(Boolean).join(","),
    defaultModel ?? "",
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
  const realtimeEnabled =
    Boolean(skill.realtimeConfig) && getSkillSessionToolbar(skill).realtime;
  const usesWorkspaceRuntime = skill.launch?.type === "sd" || realtimeEnabled;
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
  const toolServerIdSet = new Set(installedToolServerIds ?? []);
  const requiredToolServers = getRequiredSkillToolServers(skill);
  const missingToolServerCount = requiredToolServers.filter(
    (id) => !toolServerIdSet.has(id),
  ).length;
  const inactiveToolServerCount = requiredToolServers.filter((id) => {
    if (!toolServerIdSet.has(id)) return false;
    if (!toolStatuses) return false;
    return toolStatuses[id]?.status !== "active";
  }).length;
  const realtimeConfig = skill.realtimeConfig;

  const issues: SkillRuntimeIssue[] = [];

  if (!usesWorkspaceRuntime && runtimeModels.length === 0) {
    issues.push({
      type: "model",
      message: "当前没有任何可用模型",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (
    !usesWorkspaceRuntime &&
    hasCandidateModelRestriction &&
    sessionModels.length === 0
  ) {
    issues.push({
      type: "model",
      message: "候选模型当前都不可用",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (
    !usesWorkspaceRuntime &&
    !hasCandidateModelRestriction &&
    !hasCurrentModel
  ) {
    issues.push({
      type: "model",
      message: "默认模型需要调整",
    });
  }

  if (missingPluginCount > 0) {
    issues.push({
      type: "api_tool",
      message:
        missingPluginCount === 1
          ? "缺少 1 个工具配置"
          : `缺少 ${missingPluginCount} 个工具配置`,
    });
  }

  if (missingToolServerCount > 0) {
    issues.push({
      type: "tool_missing",
      message:
        missingToolServerCount === 1
          ? "缺少 1 个工具配置"
          : `缺少 ${missingToolServerCount} 个工具配置`,
    });
  }

  if (inactiveToolServerCount > 0) {
    issues.push({
      type: "tool_inactive",
      message:
        inactiveToolServerCount === 1
          ? "1 个工具未正常运行"
          : `${inactiveToolServerCount} 个工具未正常运行`,
    });
  }

  if (realtimeEnabled) {
    if (!realtimeConfig?.enabled) {
      issues.push({
        type: "realtime",
        message: "实时聊天未启用",
      });
    } else if (
      isRouterRealtimeProvider(realtimeConfig.provider) &&
      !hasRouterRealtimeToken(realtimeConfig.apiKey)
    ) {
      issues.push({
        type: "realtime",
        message: "缺少 Router 实时聊天令牌",
      });
    } else if (
      !isRouterRealtimeProvider(realtimeConfig.provider) &&
      !realtimeConfig.apiKey?.trim()
    ) {
      issues.push({
        type: "realtime",
        message: "缺少实时聊天 API Key",
      });
    } else if (
      realtimeConfig.provider === "Azure" &&
      (!realtimeConfig.azure.endpoint?.trim() ||
        !realtimeConfig.azure.deployment?.trim())
    ) {
      issues.push({
        type: "realtime",
        message: "缺少 Azure 实时聊天配置",
      });
    }
  }

  return {
    status: issues.length > 0 ? "needs_config" : "ready",
    issues,
  };
}
