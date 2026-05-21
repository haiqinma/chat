import { ServiceProvider } from "../constant";
import { LLMModel, LLMModelProvider, ModelCandidate } from "../client/api";

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
  if (!model) return undefined;
  const providerName =
    normalizeProviderId(candidate.providerName) ??
    normalizeProviderName(candidate.providerName);
  return {
    model,
    providerName,
  };
}

export function buildModelCandidateValue(candidate: ModelCandidate): string {
  const normalized = normalizeModelCandidate(candidate);
  if (!normalized) return "";
  return normalized.providerName
    ? `${normalized.model}@${normalized.providerName}`
    : normalized.model;
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
  model: Pick<LLMModel, "name" | "provider">,
  candidate: ModelCandidate,
): boolean {
  const normalized = normalizeModelCandidate(candidate);
  if (!normalized) return false;
  if (model.name !== normalized.model) return false;
  if (!normalized.providerName) return true;
  return (
    normalizeProviderId(model.provider?.id ?? model.provider?.providerName) ===
    normalized.providerName
  );
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

export function collectModelTable(
  models: readonly LLMModel[],
  customModels: string,
) {
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

  // server custom models
  customModels
    .split(",")
    .filter((v) => !!v && v.length > 0)
    .forEach((m) => {
      const available = !m.startsWith("-");
      const nameConfig =
        m.startsWith("+") || m.startsWith("-") ? m.slice(1) : m;
      let [name, displayName] = nameConfig.split("=");

      // enable or disable all models
      if (name === "all") {
        Object.values(modelTable).forEach(
          (model) => (model.available = available),
        );
      } else {
        // 1. find model by name, and set available value
        const [customModelName, customProviderName] = getModelProvider(name);
        let count = 0;
        for (const fullName in modelTable) {
          const [modelName, providerName] = getModelProvider(fullName);
          if (
            customModelName == modelName &&
            (customProviderName === undefined ||
              normalizeProviderId(customProviderName) ===
                normalizeProviderId(providerName))
          ) {
            count += 1;
            modelTable[fullName]["available"] = available;
            // swap name and displayName for volcengine
            if (
              normalizeProviderId(providerName) ===
              normalizeProviderId(ServiceProvider.Volcengine)
            ) {
              [name, displayName] = [displayName, modelName];
              modelTable[fullName]["name"] = name;
            }
            if (displayName) {
              modelTable[fullName]["displayName"] = displayName;
            }
          }
        }
        // 2. if model not exists, create new model with available value
        if (count === 0) {
          let [customModelName, customProviderName] = getModelProvider(name);
          const provider = normalizeModelProvider(
            customProviderName || customModelName,
          );
          // swap name and displayName for volcengine
          if (
            displayName &&
            provider.providerName == ServiceProvider.Volcengine
          ) {
            [customModelName, displayName] = [displayName, customModelName];
          }
          modelTable[`${customModelName}@${provider?.id}`] = {
            name: customModelName,
            displayName: displayName || customModelName,
            available,
            provider, // Use optional chaining
            sorted: CustomSeq.next(`${customModelName}@${provider?.id}`),
          };
        }
      }
    });

  return modelTable;
}

export function collectModelTableWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
) {
  let modelTable = collectModelTable(models, customModels);
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
export function collectModels(
  models: readonly LLMModel[],
  customModels: string,
) {
  const modelTable = collectModelTable(models, customModels);
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}

export function collectModelsWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
) {
  const modelTable = collectModelTableWithDefaultModel(
    models,
    customModels,
    defaultModel,
  );
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}

export function isModelAvailableInServer(
  customModels: string,
  modelName: string,
  providerName: string,
) {
  const fullName = `${modelName}@${
    normalizeProviderId(providerName) ?? providerName
  }`;
  const modelTable = collectModelTable([], customModels);
  return modelTable[fullName]?.available === false;
}

/**
 * Check if the model name is a GPT-4 related model
 *
 * @param modelName The name of the model to check
 * @returns True if the model is a GPT-4 related model (excluding gpt-4o-mini)
 */
export function isGPT4Model(modelName: string): boolean {
  return (
    (modelName.startsWith("gpt-4") ||
      modelName.startsWith("chatgpt-4o") ||
      modelName.startsWith("o1")) &&
    !modelName.startsWith("gpt-4o-mini")
  );
}

/**
 * Checks if a model is not available on any of the specified providers in the server.
 *
 * @param {string} customModels - A string of custom models, comma-separated.
 * @param {string} modelName - The name of the model to check.
 * @param {string|string[]} providerNames - A string or array of provider names to check against.
 *
 * @returns {boolean} True if the model is not available on any of the specified providers, false otherwise.
 */
export function isModelNotavailableInServer(
  customModels: string,
  modelName: string,
  providerNames: string | string[],
): boolean {
  // Check DISABLE_GPT4 environment variable
  if (
    ["1", "true"].includes(
      process.env.DISABLE_GPT4?.trim().toLowerCase() ?? "",
    ) &&
    isGPT4Model(modelName.toLowerCase())
  ) {
    return true;
  }

  const modelTable = collectModelTable([], customModels);

  const providerNamesArray = Array.isArray(providerNames)
    ? providerNames
    : [providerNames];
  for (const providerName of providerNamesArray) {
    // if model provider is volcengine, use model config name to check if not avaliable
    if (providerName === ServiceProvider.Volcengine) {
      return !Object.values(modelTable).filter((v) => v.name === modelName)?.[0]
        ?.available;
    }
    const fullName = `${modelName}@${providerName.toLowerCase()}`;
    if (modelTable?.[fullName]?.available === true) return false;
  }
  return true;
}
