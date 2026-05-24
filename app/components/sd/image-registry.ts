import { LLMModel, supportsImageGenerationEndpoint } from "@/app/client/api";
import {
  getImageEndpointSchema,
  ImageFormMode,
  ImageEndpointType,
  ImageParamSchema,
} from "./image-endpoint-schemas";

export type ImageModelDefinition = {
  name: string;
  value: string;
  provider: string;
  providerName: string;
  endpointType: ImageEndpointType;
  supportsImage: true;
  params: (data: any) => ImageParamSchema[];
};

export const imageModels: ImageModelDefinition[] = [];

export function getImageModels() {
  return imageModels;
}

export function getDefaultImageModel() {
  return getImageModels()[0];
}

export function getImageModelByValue(
  model: string,
  sourceModels?: readonly ImageModelDefinition[],
) {
  const models = sourceModels ?? getImageModels();
  return models.find((item) => item.value === model);
}

function buildRuntimeImageModel(model: LLMModel): ImageModelDefinition | null {
  return buildRuntimeImageModelForMode(model, "generation");
}

function buildRuntimeImageModelForMode(
  model: LLMModel,
  mode: ImageFormMode,
): ImageModelDefinition | null {
  const tags = model.tags ?? [];
  const endpoints = model.supportedEndpoints ?? [];
  if (!tags.includes("image")) return null;
  const endpointType: ImageEndpointType =
    mode === "editing" ? "images-edits" : "images-generation";
  const isSupported =
    mode === "editing"
      ? endpoints.includes("/v1/images/edits")
      : supportsImageGenerationEndpoint(endpoints);
  if (!isSupported) return null;

  const providerName =
    model.provider?.providerName || model.ownedBy || model.provider?.id || "";
  const providerId =
    model.provider?.id || providerName.trim().toLowerCase() || "router";

  return {
    name: model.displayName || model.name,
    value: model.name,
    provider: providerId,
    providerName,
    endpointType,
    supportsImage: true,
    params: (data: any) => getImageEndpointSchema(endpointType).params(data),
  };
}

export function resolveImageModels(
  runtimeModels?: readonly LLMModel[],
  mode: ImageFormMode = "generation",
) {
  const finalModels = new Map<string, ImageModelDefinition>();

  (runtimeModels ?? [])
    .map((model) => buildRuntimeImageModelForMode(model, mode))
    .filter((model): model is ImageModelDefinition => !!model)
    .forEach((model) => {
      finalModels.set(model.value, model);
    });

  return Array.from(finalModels.values());
}

export function getModelParams(
  model: string,
  data: any,
  sourceModels?: readonly ImageModelDefinition[],
) {
  return getImageModelByValue(model, sourceModels)?.params(data) || [];
}
