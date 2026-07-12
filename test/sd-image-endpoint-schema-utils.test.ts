import {
  buildOpenAIImageEditFormData,
  resolveOpenAIImageResult,
} from "../app/components/sd/image-endpoint-schema-utils";

describe("image endpoint schema utils", () => {
  test("builds edits FormData with image and mask", () => {
    const sourceImage = new Blob(["source"], { type: "image/png" });
    const maskImage = new Blob(["mask"], { type: "image/png" });

    const body = buildOpenAIImageEditFormData({
      model: "gpt-image-1",
      params: {
        prompt: "edit this image",
        size: "1024x1024",
        quality: "high",
        style: "natural",
      },
      sourceImage,
      maskImage,
    });

    expect(body).toBeInstanceOf(FormData);
    expect(body.get("model")).toBe("gpt-image-1");
    expect(body.get("prompt")).toBe("edit this image");
    expect(body.get("size")).toBe("1024x1024");
    expect(body.get("quality")).toBe("high");
    expect(body.get("style")).toBeNull();
    const imageFile = body.get("image") as File;
    const maskFile = body.get("mask") as File;

    expect(imageFile.name).toBe("image.png");
    expect(imageFile.type).toBe("image/png");
    expect(imageFile.size).toBe(sourceImage.size);

    expect(maskFile.name).toBe("mask.png");
    expect(maskFile.type).toBe("image/png");
    expect(maskFile.size).toBe(maskImage.size);
  });

  test("uses gpt-image quality defaults for edits", () => {
    const sourceImage = new Blob(["source"], { type: "image/png" });

    const body = buildOpenAIImageEditFormData({
      model: "gpt-image-2",
      params: {
        prompt: "edit this image",
      },
      sourceImage,
    });

    expect(body.get("quality")).toBe("auto");
  });

  test("ignores stale dall-e quality for gpt-image edits", () => {
    const body = buildOpenAIImageEditFormData({
      model: "gpt-image-2",
      params: {
        prompt: "edit this image",
        quality: "standard",
      },
    });

    expect(body.get("quality")).toBe("auto");
  });

  test("prefers b64_json when present", () => {
    expect(
      resolveOpenAIImageResult({
        data: [{ b64_json: "base64-image", url: "https://example.com/a.png" }],
      }),
    ).toEqual({
      type: "b64_json",
      value: "base64-image",
    });
  });

  test("supports url responses", () => {
    expect(
      resolveOpenAIImageResult({
        data: [{ url: "https://example.com/a.png" }],
      }),
    ).toEqual({
      type: "url",
      value: "https://example.com/a.png",
    });
  });
});
