import type {
  ModelEndpointSpecification,
  ModelParameterSpecification,
  ModelSpecification,
} from "@/app/client/api";
import Locale from "@/app/locales";
import type {
  ImageEndpointType,
  ImageParamSchema,
} from "./image-endpoint-schemas";

const IMAGE_ENDPOINT_PATHS: Record<ImageEndpointType, string> = {
  "images-generation": "/v1/images/generations",
  "images-edits": "/v1/images/edits",
};

const DEFAULT_SIZE_OPTIONS = [
  { name: "1024x1024", value: "1024x1024" },
  { name: "1792x1024", value: "1792x1024" },
  { name: "1024x1792", value: "1024x1792" },
];

const DEFAULT_DALLE_QUALITY_OPTIONS = [
  { name: "standard", value: "standard" },
  { name: "hd", value: "hd" },
];

const DEFAULT_GPT_IMAGE_QUALITY_OPTIONS = [
  { name: "auto", value: "auto" },
  { name: "high", value: "high" },
  { name: "medium", value: "medium" },
  { name: "low", value: "low" },
];

const SPEC_PARAM_ORDER = [
  "negative_prompt",
  "size",
  "image_size",
  "aspect_ratio",
  "width",
  "height",
  "quality",
  "style",
  "n",
  "seed",
];

function isGptImageModel(model?: string) {
  return model?.toLowerCase().startsWith("gpt-image") ?? false;
}

function endpointSpec(
  specification: ModelSpecification | undefined,
  endpointType: ImageEndpointType,
): ModelEndpointSpecification | undefined {
  return specification?.endpoints?.[IMAGE_ENDPOINT_PATHS[endpointType]];
}

function valuesToOptions(values?: string[]) {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ name: value, value }));
}

function enumParam(
  name: string,
  value: string,
  parameter?: ModelParameterSpecification,
): ImageParamSchema | undefined {
  const options = valuesToOptions(parameter?.allowed_values);
  if (options.length === 0) return undefined;
  return {
    name,
    value,
    type: "select",
    default: options[0].value,
    options,
    span: "half",
  };
}

function numberParam(
  name: string,
  value: string,
  parameter?: ModelParameterSpecification,
): ImageParamSchema | undefined {
  if (!parameter) return undefined;
  return {
    name,
    value,
    type: "number",
    default: parameter.min ?? 1,
    min: parameter.min,
    max: parameter.max,
    span: "half",
  };
}

function textareaParam(
  name: string,
  value: string,
  parameter?: ModelParameterSpecification,
): ImageParamSchema | undefined {
  if (!parameter) return undefined;
  return {
    name,
    value,
    type: "textarea",
    default: "",
    span: "full",
  };
}

function defaultSizeParam(): ImageParamSchema {
  return {
    name: Locale.SdPanel.ImageSize,
    value: "size",
    type: "select",
    default: DEFAULT_SIZE_OPTIONS[0].value,
    options: DEFAULT_SIZE_OPTIONS,
    span: "half",
  };
}

function defaultQualityParam(model?: string): ImageParamSchema {
  const options = isGptImageModel(model)
    ? DEFAULT_GPT_IMAGE_QUALITY_OPTIONS
    : DEFAULT_DALLE_QUALITY_OPTIONS;
  return {
    name: Locale.SdPanel.ImageQuality,
    value: "quality",
    type: "select",
    default: options[0].value,
    options,
    span: "half",
  };
}

function defaultStyleParam(): ImageParamSchema {
  return {
    name: Locale.SdPanel.ImageStyle,
    value: "style",
    type: "select",
    default: "vivid",
    span: "half",
    options: [
      { name: "vivid", value: "vivid" },
      { name: "natural", value: "natural" },
    ],
  };
}

function supportsLegacyStyleParam(model?: string) {
  const normalizedModel = model?.toLowerCase() ?? "";
  return normalizedModel === "dall-e-3";
}

function withControl(
  schema: ImageParamSchema | undefined,
  control: "slider",
): ImageParamSchema | undefined {
  if (!schema) return undefined;
  return { ...schema, control };
}

function withSpan(
  schema: ImageParamSchema | undefined,
  span: "full" | "half",
): ImageParamSchema | undefined {
  if (!schema) return undefined;
  return { ...schema, span };
}

function buildSpecParam(
  key: string,
  parameter: ModelParameterSpecification | undefined,
  model?: string,
): ImageParamSchema | undefined {
  switch (key) {
    case "size":
      return enumParam(Locale.SdPanel.ImageSize, key, parameter);
    case "image_size":
      return enumParam(Locale.SdPanel.ImageSize, key, parameter);
    case "aspect_ratio":
      return enumParam(Locale.SdPanel.AspectRatio, key, parameter);
    case "quality":
      return enumParam(Locale.SdPanel.ImageQuality, key, parameter);
    case "style":
      return (
        enumParam(Locale.SdPanel.ImageStyle, key, parameter) ??
        (supportsLegacyStyleParam(model) ? defaultStyleParam() : undefined)
      );
    case "width":
      return withControl(numberParam("Width", key, parameter), "slider");
    case "height":
      return withControl(numberParam("Height", key, parameter), "slider");
    case "n":
      return withControl(numberParam("N", key, parameter), "slider");
    case "seed":
      return withSpan(numberParam("Seed", key, parameter), "full");
    case "negative_prompt":
      return textareaParam(Locale.SdPanel.NegativePrompt, key, parameter);
    default:
      return undefined;
  }
}

export function buildImageModelParamSchemas(input: {
  model?: string;
  endpointType: ImageEndpointType;
  specification?: ModelSpecification;
}): ImageParamSchema[] {
  const spec = endpointSpec(input.specification, input.endpointType);
  const parameters = spec?.parameters ?? {};
  const schemas = SPEC_PARAM_ORDER.map((key) =>
    buildSpecParam(key, parameters[key], input.model),
  ).filter(Boolean) as ImageParamSchema[];

  if (schemas.length > 0) return schemas;

  return [defaultSizeParam(), defaultQualityParam(input.model)];
}

function normalizeBySchema(schema: ImageParamSchema, raw: any) {
  if (schema.type === "select") {
    const values = schema.options?.map((option) => option.value) ?? [];
    return values.includes(raw) ? raw : schema.default || values[0] || "";
  }

  if (schema.type === "number") {
    const fallback = schema.default ?? schema.min ?? 0;
    const value = Number(raw ?? fallback);
    const finiteValue = Number.isFinite(value) ? value : fallback;
    const min = typeof schema.min === "number" ? schema.min : undefined;
    const max = typeof schema.max === "number" ? schema.max : undefined;
    if (typeof min === "number" && finiteValue < min) return min;
    if (typeof max === "number" && finiteValue > max) return max;
    return finiteValue;
  }

  return raw ?? schema.default ?? "";
}

export function normalizeImageParamsForModel(input: {
  model?: string;
  endpointType: ImageEndpointType;
  specification?: ModelSpecification;
  params?: Record<string, any>;
}) {
  const schemas = buildImageModelParamSchemas(input);
  return schemas.reduce<Record<string, any>>((next, schema) => {
    next[schema.value] = normalizeBySchema(
      schema,
      input.params?.[schema.value],
    );
    return next;
  }, {});
}
