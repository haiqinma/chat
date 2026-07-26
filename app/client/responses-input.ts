function getResponsesTextContentType(role: string) {
  return role === "assistant" ? "output_text" : "input_text";
}

export function normalizeResponsesInputContent(content: any, role = "user") {
  const textType = getResponsesTextContentType(role);
  if (typeof content === "string") {
    return [{ type: textType, text: content }];
  }
  if (!Array.isArray(content)) return content;

  let changed = false;
  const converted = content.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return part;
    const partType = typeof part.type === "string" ? part.type : "";
    if (
      partType === "text" ||
      partType === "input_text" ||
      partType === "output_text"
    ) {
      changed = true;
      return {
        type: textType,
        text: typeof part.text === "string" ? part.text : "",
      };
    }
    if (partType === "image_url") {
      let url = "";
      let detail = "";
      if (typeof part.image_url === "string") {
        url = part.image_url;
      } else if (part.image_url && typeof part.image_url === "object") {
        if (typeof part.image_url.url === "string") {
          url = part.image_url.url;
        }
        if (typeof part.image_url.detail === "string") {
          detail = part.image_url.detail;
        }
      }
      if (!url) return part;
      changed = true;
      return {
        type: "input_image",
        image_url: url,
        ...(detail ? { detail } : {}),
      };
    }
    if (partType === "file_url") {
      let url = "";
      let filename = "";
      if (typeof part.file_url === "string") {
        url = part.file_url;
      } else if (part.file_url && typeof part.file_url === "object") {
        if (typeof part.file_url.url === "string") {
          url = part.file_url.url;
        }
        if (typeof part.file_url.name === "string") {
          filename = part.file_url.name;
        }
      }
      if (!url) return part;
      changed = true;
      return {
        type: "input_file",
        file_url: url,
        ...(filename ? { filename } : {}),
      };
    }
    return part;
  });

  return changed ? converted : content;
}

export function normalizeResponsesInputMessages(input: any) {
  if (!Array.isArray(input)) return input;
  let changed = false;
  const normalized = input.map((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    if (!Object.prototype.hasOwnProperty.call(item, "content")) return item;
    const role = typeof item.role === "string" ? item.role : "user";
    const nextContent = normalizeResponsesInputContent(item.content, role);
    if (nextContent === item.content) return item;
    changed = true;
    return {
      ...item,
      content: nextContent,
    };
  });
  return changed ? normalized : input;
}

export function hasResponsesNonTextInput(input: any): boolean {
  if (!Array.isArray(input)) return false;
  return input.some((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (!Array.isArray(item.content)) return false;
    return item.content.some((part: any) => {
      const partType = typeof part?.type === "string" ? part.type : "";
      return (
        partType === "input_image" ||
        partType === "image_url" ||
        partType === "input_file" ||
        partType === "file_url"
      );
    });
  });
}
