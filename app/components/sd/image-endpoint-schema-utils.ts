import type { ImageEndpointSchema } from "./image-endpoint-schemas";
import type { ModelSpecification } from "@/app/client/api";
import { normalizeImageParamsForModel } from "./image-param-spec";

export type ResolvedImageResult = NonNullable<
  ReturnType<ImageEndpointSchema["resolveImageResult"]>
>;

export function buildOpenAIImageEditFormData(data: {
  model: string;
  params: Record<string, any>;
  specification?: ModelSpecification;
  sourceImage?: Blob;
  maskImage?: Blob;
}) {
  const body = new FormData();
  const normalizedParams = normalizeImageParamsForModel({
    model: data.model,
    endpointType: "images-edits",
    specification: data.specification,
    params: data.params,
  });
  body.append("model", data.model);
  body.append("prompt", data.params.prompt || "");
  Object.entries(normalizedParams).forEach(([key, value]) => {
    body.append(key, String(value));
  });
  if (data.sourceImage) {
    body.append("image", data.sourceImage, "image.png");
  }
  if (data.maskImage) {
    body.append("mask", data.maskImage, "mask.png");
  }
  return body;
}

export function resolveOpenAIImageResult(
  response: any,
): ResolvedImageResult | undefined {
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
}
