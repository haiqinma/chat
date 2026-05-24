import Locale from "@/app/locales";

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
    sourceImage?: Blob;
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

const imageSizeParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageSize,
  value: "size",
  type: "select",
  default: "1024x1024",
  options: [
    { name: "1024x1024", value: "1024x1024" },
    { name: "1792x1024", value: "1792x1024" },
    { name: "1024x1792", value: "1024x1792" },
  ],
};

const imageQualityParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageQuality,
  value: "quality",
  type: "select",
  default: "standard",
  options: [
    { name: "standard", value: "standard" },
    { name: "hd", value: "hd" },
  ],
};

const imageStyleParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageStyle,
  value: "style",
  type: "select",
  default: "vivid",
  options: [
    { name: "vivid", value: "vivid" },
    { name: "natural", value: "natural" },
  ],
};

export const imageEndpointSchemas: Record<
  ImageEndpointType,
  ImageEndpointSchema
> = {
  "images-generation": {
    params: () => [
      promptParam,
      imageSizeParam,
      imageQualityParam,
      imageStyleParam,
    ],
    buildRequestBody: ({ model, params }) => ({
      model,
      prompt: params.prompt,
      response_format: "b64_json",
      n: 1,
      size: params.size || "1024x1024",
      quality: params.quality || "standard",
      style: params.style || "vivid",
    }),
    resolveImageResult: (response) => {
      const b64Json = response?.data?.[0]?.b64_json;
      if (typeof b64Json === "string" && b64Json) {
        return {
          type: "b64_json",
          value: b64Json,
        };
      }

      const url = response?.data?.[0]?.url;
      if (typeof url === "string" && url) {
        return {
          type: "url",
          value: url,
        };
      }

      return undefined;
    },
    resolveErrorMessage: (response) =>
      response?.error?.message ||
      response?.message ||
      (Array.isArray(response?.errors) ? response.errors[0] : "") ||
      "",
  },
  "images-edits": {
    params: () => [
      promptParam,
      imageSizeParam,
      imageQualityParam,
      imageStyleParam,
    ],
    buildRequestBody: ({ model, params, sourceImage }) => {
      const body = new FormData();
      body.append("model", model);
      body.append("prompt", params.prompt || "");
      body.append("size", params.size || "1024x1024");
      body.append("quality", params.quality || "standard");
      body.append("style", params.style || "vivid");
      if (sourceImage) {
        body.append("image", sourceImage, "image.png");
      }
      return body;
    },
    resolveImageResult: (response) => {
      const b64Json = response?.data?.[0]?.b64_json;
      if (typeof b64Json === "string" && b64Json) {
        return {
          type: "b64_json",
          value: b64Json,
        };
      }

      const url = response?.data?.[0]?.url;
      if (typeof url === "string" && url) {
        return {
          type: "url",
          value: url,
        };
      }

      return undefined;
    },
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
