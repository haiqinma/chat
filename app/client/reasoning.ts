import type { LLMConfig } from "./api";

export type ReasoningMode = "off" | "auto" | "on";
export type ReasoningEffort = "low" | "medium" | "high";

type ReasoningIntent = {
  enabled: boolean;
  effort: ReasoningEffort;
  capable: boolean;
};

function normalizeProvider(providerName?: string) {
  return (providerName ?? "").trim().toLowerCase();
}

function normalizeModel(model?: string) {
  return (model ?? "").trim().toLowerCase();
}

function normalizeTags(tags?: readonly string[]) {
  return Array.isArray(tags) ? tags.map((tag) => tag.toLowerCase()) : [];
}

function isAnthropicAdaptiveThinkingModel(model: string) {
  return (
    model.includes("opus-4-6") ||
    model.includes("opus-4-7") ||
    model.includes("sonnet-4-6") ||
    model.includes("haiku-4-5") ||
    model.includes("claude-fable-5") ||
    model.includes("claude-mythos-5")
  );
}

function getAnthropicThinkingBudget(
  effort: ReasoningEffort,
  maxTokens: number,
) {
  const ratio = effort === "high" ? 0.8 : effort === "medium" ? 0.5 : 0.25;
  const rawBudget = Math.floor(maxTokens * ratio);
  return Math.max(1024, Math.min(rawBudget, maxTokens - 1));
}

export function isReasoningCapableModel(
  config: Pick<LLMConfig, "model" | "providerName" | "tags" | "ownedBy">,
) {
  const model = normalizeModel(config.model);
  const providers = [
    normalizeProvider(config.providerName),
    normalizeProvider(config.ownedBy),
  ].filter(Boolean);
  const tags = normalizeTags(config.tags);
  if (tags.includes("reasoning")) return true;

  if (
    model.startsWith("gpt-5") ||
    model.startsWith("o1") ||
    model.startsWith("o3")
  ) {
    return true;
  }
  if (
    model === "deepseek-reasoner" ||
    model.startsWith("deepseek-v4-") ||
    providers.some((provider) => provider.includes("deepseek"))
  ) {
    return model === "deepseek-reasoner" || model.startsWith("deepseek-v4-");
  }
  if (
    providers.some(
      (provider) =>
        provider.includes("anthropic") || provider.includes("claude"),
    )
  ) {
    return (
      model.includes("thinking") ||
      model.includes("opus-4") ||
      model.includes("sonnet-4") ||
      model.includes("haiku-4-5") ||
      model.includes("claude-fable-5") ||
      model.includes("claude-mythos-5")
    );
  }
  if (
    model.startsWith("qwen3") ||
    model.startsWith("qwq-") ||
    model.startsWith("qvq-") ||
    providers.some(
      (provider) => provider.includes("qwen") || provider.includes("alibaba"),
    )
  ) {
    return (
      model.startsWith("qwen3") ||
      model.startsWith("qwq-") ||
      model.startsWith("qvq-")
    );
  }
  return false;
}

export function resolveReasoningIntent(config: LLMConfig): ReasoningIntent {
  const capable = isReasoningCapableModel(config);
  const mode = config.reasoningMode ?? "off";
  const effort = config.reasoningEffort ?? "medium";
  return {
    capable,
    effort,
    enabled: capable && mode === "on",
  };
}

export function applyDeepSeekReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.capable) return;

  const model = normalizeModel(config.model);
  const enabled = intent.enabled || model === "deepseek-reasoner";
  payload.thinking = { type: enabled ? "enabled" : "disabled" };
  if (!enabled) return;

  payload.reasoning_effort = intent.effort;
  delete payload.temperature;
  delete payload.top_p;
  delete payload.presence_penalty;
  delete payload.frequency_penalty;
}

export function applyOpenAIReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.enabled) return;
  payload.reasoning = { effort: intent.effort };
}

export function applyQwenReasoning(
  parameters: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.capable) return;
  parameters.enable_thinking = intent.enabled;
}

export function applyVolcengineReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.capable) return;
  payload.thinking = { type: intent.enabled ? "enabled" : "disabled" };
}

export function applyZhipuReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.capable) return;
  payload.thinking = { type: intent.enabled ? "enabled" : "disabled" };
}

export function applyOpenAICompatibleReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const provider = normalizeProvider(config.ownedBy || config.providerName);
  if (provider.includes("deepseek")) {
    applyDeepSeekReasoning(payload, config);
    return;
  }
  if (provider.includes("qwen") || provider.includes("alibaba")) {
    applyQwenReasoning(payload, config);
    return;
  }
  if (provider.includes("volcengine") || provider.includes("doubao")) {
    applyVolcengineReasoning(payload, config);
    return;
  }
  if (
    provider.includes("zhipu") ||
    provider.includes("chatglm") ||
    provider.includes("glm")
  ) {
    applyZhipuReasoning(payload, config);
    return;
  }
  applyOpenAIReasoning(payload, config);
}

export function applyMessagesReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const provider = normalizeProvider(config.ownedBy || config.providerName);
  if (provider.includes("deepseek")) {
    applyDeepSeekReasoning(payload, config);
    return;
  }
  applyAnthropicReasoning(payload, config);
}

export function applyAnthropicReasoning(
  payload: Record<string, any>,
  config: LLMConfig,
) {
  const intent = resolveReasoningIntent(config);
  if (!intent.enabled) return;

  const maxTokens = Number(payload.max_tokens || config.max_tokens || 4000);
  const model = normalizeModel(config.model);

  if (isAnthropicAdaptiveThinkingModel(model)) {
    payload.thinking = {
      type: "enabled",
    };
    payload.output_config = {
      ...(payload.output_config ?? {}),
      effort: intent.effort,
    };
    delete payload.temperature;
    delete payload.top_p;
    delete payload.top_k;
    return;
  }

  const budgetTokens = getAnthropicThinkingBudget(intent.effort, maxTokens);
  if (budgetTokens >= maxTokens) return;
  payload.thinking = {
    type: "enabled",
    budget_tokens: budgetTokens,
  };
}
