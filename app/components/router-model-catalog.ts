import type { LLMModel } from "../client/api";

function providerKeys(model: LLMModel) {
  return [model.provider?.id, model.provider?.providerName, model.ownedBy]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean) as string[];
}

function buildMetadataIndex(providerModels: readonly LLMModel[]) {
  const byExactKey = new Map<string, LLMModel>();
  const byName = new Map<string, LLMModel[]>();

  providerModels.forEach((model) => {
    const name = model.name.trim().toLowerCase();
    if (!name) return;

    providerKeys(model).forEach((providerKey) => {
      byExactKey.set(`${name}@${providerKey}`, model);
    });

    const models = byName.get(name) ?? [];
    models.push(model);
    byName.set(name, models);
  });

  return { byExactKey, byName };
}

function findMetadata(
  model: LLMModel,
  index: ReturnType<typeof buildMetadataIndex>,
) {
  const name = model.name.trim().toLowerCase();
  if (!name) return undefined;

  for (const providerKey of providerKeys(model)) {
    const matched = index.byExactKey.get(`${name}@${providerKey}`);
    if (matched) return matched;
  }

  const byName = index.byName.get(name) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}

export function buildTokenScopedRouterModelCatalog(
  tokenModels: readonly LLMModel[],
  providerModels: readonly LLMModel[],
) {
  const index = buildMetadataIndex(providerModels);

  return tokenModels.map((model) => {
    const metadata = findMetadata(model, index);
    if (!metadata) return model;

    return {
      ...model,
      displayName: model.displayName || metadata.displayName,
      tags: model.tags?.length ? model.tags : metadata.tags,
      modelType: model.modelType || metadata.modelType,
      status: model.status || metadata.status,
      description: model.description || metadata.description,
      specification: model.specification || metadata.specification,
    };
  });
}
