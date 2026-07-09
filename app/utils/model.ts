import { ServiceProvider } from "../constant";
import { LLMModel, LLMModelProvider, ModelCandidate } from "../client/api";
import { isReasoningCapableModel } from "../client/reasoning";
import { supportsTextEndpoint } from "../client/endpoints";

const CustomSeq = {
  val: -1000, //To ensure the custom model located at front, start from -1000, refer to constant.ts
  cache: new Map<string, number>(),
  next: (id: string) => {
    if (CustomSeq.cache.has(id)) {
      return CustomSeq.cache.get(id) as number;
    } else {
      let seq = CustomSeq.val++;
      CustomSeq.cache.set(id, seq);
      return seq;
    }
  },
};

const customProvider = (providerName: string) => ({
  id: providerName.toLowerCase(),
  providerName: providerName,
  providerType: "custom",
  sorted: CustomSeq.next(providerName),
});

function serviceProviderId(providerName: ServiceProvider | string) {
  if (providerName === ServiceProvider["302.AI"]) return "302ai";
  return providerName.toLowerCase();
}

const providerMap = (() => {
  const map = new Map<string, LLMModelProvider>();
  Object.values(ServiceProvider).forEach((providerName, index) => {
    const provider = {
      id: serviceProviderId(providerName),
      providerName,
      providerType: serviceProviderId(providerName),
      sorted: index + 1,
    };
    map.set(provider.id.toLowerCase(), provider);
    map.set(provider.providerName.toLowerCase(), provider);
  });
  return map;
})();

function normalizeProviderId(providerName?: string): string | undefined {
  if (!providerName) return undefined;
  const trimmed = providerName.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.toLowerCase();

  if (normalized === "302.ai") return "302ai";

  const serviceProvider = Object.values(ServiceProvider).find(
    (p) => p.toLowerCase() === normalized,
  );

  return serviceProvider ? serviceProviderId(serviceProvider) : normalized;
}

export function normalizeProviderName(
  providerName?: string,
): string | undefined {
  if (!providerName) return undefined;
  const trimmed = providerName.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.toLowerCase();
  const serviceProvider = Object.values(ServiceProvider).find(
    (p) => p.toLowerCase() === normalized,
  );
  return serviceProvider ?? trimmed;
}

export function normalizeModelProvider(
  provider: LLMModel["provider"] | string | undefined | null,
): LLMModelProvider {
  if (provider && typeof provider === "object") {
    const providerId = String(provider.id ?? "")
      .trim()
      .toLowerCase();
    const rawProviderName = String(provider.providerName ?? "").trim();
    const providerName = normalizeProviderName(provider.providerName);
    const knownProvider =
      providerMap.get(providerId) ||
      (providerName ? providerMap.get(providerName.toLowerCase()) : undefined);

    if (knownProvider) {
      return {
        ...knownProvider,
        providerName: rawProviderName || knownProvider.providerName,
        providerType: provider.providerType ?? knownProvider.providerType,
        sorted:
          Number.isFinite(provider.sorted) &&
          typeof provider.sorted === "number"
            ? provider.sorted
            : knownProvider.sorted,
      };
    }

    const fallbackName = providerName ?? ServiceProvider.OpenAI;
    const fallbackId =
      normalizeProviderId(provider.id || fallbackName) ??
      ServiceProvider.OpenAI.toLowerCase();

    return {
      id: fallbackId,
      providerName: fallbackName,
      providerType: provider.providerType ?? "custom",
      sorted:
        Number.isFinite(provider.sorted) && typeof provider.sorted === "number"
          ? provider.sorted
          : CustomSeq.next(fallbackName),
    };
  }

  const name =
    normalizeProviderName(
      typeof provider === "string" ? provider : undefined,
    ) ?? ServiceProvider.OpenAI;
  const knownProvider = providerMap.get(name.toLowerCase());

  if (knownProvider) return { ...knownProvider };
  return customProvider(name);
}

export function normalizeModel(model: LLMModel): LLMModel {
  const provider = normalizeModelProvider(
    (model as LLMModel & { provider?: LLMModel["provider"] | string }).provider,
  );
  const key = `${model.name}@${provider.id}`;
  const sorted =
    Number.isFinite(model.sorted) && typeof model.sorted === "number"
      ? model.sorted
      : CustomSeq.next(key);

  return {
    ...model,
    displayName: model.displayName ?? model.name,
    available: model.available !== false,
    provider,
    tags: Array.isArray(model.tags)
      ? model.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    sorted,
  };
}

export function normalizeModels(models: readonly LLMModel[]): LLMModel[] {
  return (models ?? [])
    .filter((model): model is LLMModel => !!model && !!model.name)
    .map((model) => normalizeModel(model));
}

/**
 * Sorts an array of models based on specified rules.
 *
 * First, sorted by provider; if the same, sorted by model
 */
const sortModelTable = (models: ReturnType<typeof collectModels>) =>
  models.sort((a, b) => {
    if (a.provider && b.provider) {
      let cmp = a.provider.sorted - b.provider.sorted;
      return cmp === 0 ? a.sorted - b.sorted : cmp;
    } else {
      return a.sorted - b.sorted;
    }
  });

/**
 * get model name and provider from a formatted string,
 * e.g. `gpt-4@OpenAi` or `claude-3-5-sonnet@20240620@Google`
 * @param modelWithProvider model name with provider separated by last `@` char,
 * @returns [model, provider] tuple, if no `@` char found, provider is undefined
 */
export function getModelProvider(modelWithProvider: string): [string, string?] {
  const [model, provider] = modelWithProvider.split(/@(?!.*@)/);
  return [model, provider];
}

export function normalizeModelCandidate(
  candidate?: ModelCandidate | null,
): ModelCandidate | undefined {
  if (!candidate) return undefined;
  const model = candidate.model?.trim();
  const providerName =
    normalizeProviderId(candidate.providerName) ??
    normalizeProviderName(candidate.providerName);
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    : undefined;
  const capability =
    candidate.capability === "reasoning" ? candidate.capability : undefined;
  if (!model && !providerName && !tags?.length && !capability) {
    return undefined;
  }
  return {
    model,
    providerName,
    tags,
    capability,
  };
}

export function buildModelCandidateValue(candidate: ModelCandidate): string {
  const normalized = normalizeModelCandidate(candidate);
  if (!normalized) return "";
  return [
    normalized.model ? `model:${normalized.model}` : undefined,
    normalized.providerName ? `provider:${normalized.providerName}` : undefined,
    normalized.capability ? `capability:${normalized.capability}` : undefined,
    ...(normalized.tags ?? []).map((tag) => `tag:${tag}`),
  ]
    .filter(Boolean)
    .join("|");
}

export function normalizeModelCandidates(
  candidates?: readonly ModelCandidate[],
): ModelCandidate[] {
  const normalized = (candidates ?? [])
    .map((candidate) => normalizeModelCandidate(candidate))
    .filter((candidate): candidate is ModelCandidate => !!candidate);
  const seen = new Set<string>();
  return normalized.filter((candidate) => {
    const value = buildModelCandidateValue(candidate);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function matchesModelCandidate(
  model: Pick<LLMModel, "name" | "provider" | "ownedBy" | "tags">,
  candidate: ModelCandidate,
): boolean {
  const normalized = normalizeModelCandidate(candidate);
  if (!normalized) return false;
  if (normalized.model && model.name !== normalized.model) return false;
  if (normalized.providerName) {
    const matchesProvider =
      normalizeProviderId(
        model.provider?.id ?? model.provider?.providerName,
      ) === normalized.providerName;
    if (!matchesProvider) return false;
  }
  if (normalized.tags?.length) {
    const modelTags = new Set(
      (model.tags ?? []).map((tag) => tag.toLowerCase()),
    );
    if (!normalized.tags.every((tag) => modelTags.has(tag))) return false;
  }
  if (normalized.capability === "reasoning") {
    return isReasoningCapableModel({
      model: model.name,
      providerName: model.provider?.providerName,
      ownedBy: model.ownedBy,
      tags: model.tags,
    });
  }
  return true;
}

export function filterModelsByCandidates(
  models: readonly LLMModel[],
  candidates?: readonly ModelCandidate[],
): LLMModel[] {
  const normalizedModels = normalizeModels(models);
  const normalizedCandidates = normalizeModelCandidates(candidates);
  if (normalizedCandidates.length === 0) {
    return normalizedModels;
  }
  return normalizedModels.filter((model) =>
    normalizedCandidates.some((candidate) =>
      matchesModelCandidate(model, candidate),
    ),
  );
}

export function isReasoningOnlyModel(model: Pick<LLMModel, "tags">): boolean {
  const tags = (model.tags ?? []).map((tag) => tag.trim().toLowerCase());

  return tags.includes("reasoning") && !tags.includes("text");
}

export function isGeneralTextChatModel(model: LLMModel): boolean {
  if (!model.available) return false;
  if (isReasoningOnlyModel(model)) return false;

  const tags = Array.isArray(model.tags) ? model.tags : [];
  if (tags.length > 0) return tags.includes("text");

  const endpoints = model.supportedEndpoints ?? [];
  if (endpoints.length > 0) return supportsTextEndpoint(endpoints);

  return true;
}

export function collectModelTable(models: readonly LLMModel[]) {
  const modelTable: Record<
    string,
    {
      available: boolean;
      name: string;
      displayName: string;
      sorted: number;
      provider?: LLMModel["provider"]; // Marked as optional
      isDefault?: boolean;
    }
  > = {};

  // default models
  normalizeModels(models).forEach((m) => {
    // using <modelName>@<providerId> as fullName
    const providerId =
      normalizeProviderId(m?.provider?.id) ??
      normalizeProviderId(m?.provider?.providerName) ??
      ServiceProvider.OpenAI.toLowerCase();
    modelTable[`${m.name}@${providerId}`] = {
      ...m,
      displayName: m.displayName ?? m.name, // 'provider' is copied over if it exists
    };
  });

  return modelTable;
}

export function collectModelTableWithDefaultModel(
  models: readonly LLMModel[],
  defaultModel: string,
) {
  let modelTable = collectModelTable(models);
  if (defaultModel && defaultModel !== "") {
    if (defaultModel.includes("@")) {
      const [modelName, providerName] = getModelProvider(defaultModel);
      const normalizedFullName = `${modelName}@${
        normalizeProviderId(providerName) ?? providerName
      }`;
      if (normalizedFullName in modelTable) {
        modelTable[normalizedFullName].isDefault = true;
      }
    } else {
      for (const key of Object.keys(modelTable)) {
        if (
          modelTable[key].available &&
          getModelProvider(key)[0] == defaultModel
        ) {
          modelTable[key].isDefault = true;
          break;
        }
      }
    }
  }
  return modelTable;
}

/**
 * Generate full model table.
 */
export function collectModels(models: readonly LLMModel[]) {
  const modelTable = collectModelTable(models);
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}

export function collectModelsWithDefaultModel(
  models: readonly LLMModel[],
  defaultModel: string,
) {
  const modelTable = collectModelTableWithDefaultModel(models, defaultModel);
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}
