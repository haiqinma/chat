import Locale from "@/app/locales";
import type { ModelSpecification } from "@/app/client/api";
import {
  buildOpenAIImageEditFormData,
  resolveOpenAIImageResult,
} from "./image-endpoint-schema-utils";
import {
  buildImageModelParamSchemas,
  normalizeImageParamsForModel,
} from "./image-param-spec";

export type ImageEndpointType = "images-generation" | "images-edits";
export type ImageFormMode = "generation" | "editing";

export type ImageParamOption = {
  name: string;
  value: string;
};

export type ImageParamSchema = {
  name: string;
  value: string;
  type: "text" | "textarea" | "select" | "number";
  placeholder?: string;
  required?: boolean;
  default?: any;
  options?: ImageParamOption[];
  min?: number;
  max?: number;
  sub?: string;
};

export type ImageEndpointSchema = {
  params: (data: any) => ImageParamSchema[];
  buildRequestBody: (data: {
    model: string;
    params: Record<string, any>;
    specification?: ModelSpecification;
    sourceImage?: Blob;
    maskImage?: Blob;
  }) => Record<string, any> | FormData;
  resolveImageResult: (response: any) =>
    | {
        type: "b64_json";
        value: string;
      }
    | {
        type: "url";
        value: string;
      }
    | undefined;
  resolveErrorMessage: (response: any) => string;
};

const promptParam: ImageParamSchema = {
  name: Locale.SdPanel.Prompt,
  value: "prompt",
  type: "textarea",
  placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.Prompt),
  required: true,
};

function getModelParams(
  model: string | undefined,
  endpointType: ImageEndpointType,
  specification?: ModelSpecification,
) {
  return buildImageModelParamSchemas({ model, endpointType, specification });
}

function normalizeRequestParams(
  model: string,
  endpointType: ImageEndpointType,
  specification: ModelSpecification | undefined,
  params: Record<string, any>,
) {
  return normalizeImageParamsForModel({
    model,
    endpointType,
    specification,
    params,
  });
}

export const imageEndpointSchemas: Record<
  ImageEndpointType,
  ImageEndpointSchema
> = {
  "images-generation": {
    params: (data) =>
      [
        promptParam,
        ...getModelParams(
          data?.model,
          "images-generation",
          data?.specification,
        ),
      ].filter(Boolean) as ImageParamSchema[],
    buildRequestBody: ({ model, params, specification }) => {
      const normalizedParams = normalizeRequestParams(
        model,
        "images-generation",
        specification,
        params,
      );
      return {
        model,
        prompt: params.prompt,
        response_format: "b64_json",
        n: normalizedParams.n ?? 1,
        ...normalizedParams,
      };
    },
    resolveImageResult: resolveOpenAIImageResult,
    resolveErrorMessage: (response) =>
      response?.error?.message ||
      response?.message ||
      (Array.isArray(response?.errors) ? response.errors[0] : "") ||
      "",
  },
  "images-edits": {
    params: (data) =>
      [
        promptParam,
        ...getModelParams(data?.model, "images-edits", data?.specification),
      ].filter(Boolean) as ImageParamSchema[],
    buildRequestBody: buildOpenAIImageEditFormData,
    resolveImageResult: resolveOpenAIImageResult,
    resolveErrorMessage: (response) =>
      response?.error?.message ||
      response?.message ||
      (Array.isArray(response?.errors) ? response.errors[0] : "") ||
      "",
  },
};

export function getImageEndpointSchema(endpointType: ImageEndpointType) {
  return imageEndpointSchemas[endpointType];
}
