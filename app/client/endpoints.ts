export const SupportedTextEndpoint = {
  Responses: "/v1/responses",
  ChatCompletions: "/v1/chat/completions",
  Messages: "/v1/messages",
} as const;

export const SupportedEndpoint = {
  ...SupportedTextEndpoint,
  ImagesGenerations: "/v1/images/generations",
  ImagesEdits: "/v1/images/edits",
} as const;

export function normalizeModelEndpointPath(
  endpointPath?: string,
): string | undefined {
  if (!endpointPath) return undefined;
  let normalized = endpointPath.trim();
  if (!normalized) return undefined;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      return undefined;
    }
  }
  const queryIndex = normalized.indexOf("?");
  if (queryIndex >= 0) {
    normalized = normalized.slice(0, queryIndex);
  }
  const hashIndex = normalized.indexOf("#");
  if (hashIndex >= 0) {
    normalized = normalized.slice(0, hashIndex);
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function normalizeSupportedEndpoints(
  endpoints?: readonly string[],
): string[] {
  if (!Array.isArray(endpoints)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  endpoints.forEach((endpoint) => {
    const value = normalizeModelEndpointPath(endpoint);
    if (!value || seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });
  return normalized;
}

export function selectPreferredTextEndpoint(
  endpoints?: readonly string[],
  options?: {
    preferResponses?: boolean;
    modelName?: string;
  },
): string | undefined {
  const normalized = normalizeSupportedEndpoints(endpoints);
  if (normalized.length === 0) return undefined;
  const isGptSeriesModel = /^(gpt-|chatgpt-)/i.test(
    String(options?.modelName || "").trim(),
  );
  const supportsResponses = normalized.includes(
    SupportedTextEndpoint.Responses,
  );
  const supportsChatCompletions = normalized.includes(
    SupportedTextEndpoint.ChatCompletions,
  );
  const shouldPreferResponses =
    (isGptSeriesModel && supportsResponses && supportsChatCompletions) ||
    options?.preferResponses !== false;
  const order = shouldPreferResponses
    ? [
        SupportedTextEndpoint.Responses,
        SupportedTextEndpoint.Messages,
        SupportedTextEndpoint.ChatCompletions,
      ]
    : [
        SupportedTextEndpoint.ChatCompletions,
        SupportedTextEndpoint.Responses,
        SupportedTextEndpoint.Messages,
      ];
  for (const endpoint of order) {
    if (normalized.includes(endpoint)) return endpoint;
  }
  return undefined;
}

export function supportsTextEndpoint(endpoints?: readonly string[]): boolean {
  return selectPreferredTextEndpoint(endpoints) !== undefined;
}

export function supportsImageGenerationEndpoint(
  endpoints?: readonly string[],
): boolean {
  return normalizeSupportedEndpoints(endpoints).includes(
    SupportedEndpoint.ImagesGenerations,
  );
}

export function supportsImageEditEndpoint(
  endpoints?: readonly string[],
): boolean {
  return normalizeSupportedEndpoints(endpoints).includes(
    SupportedEndpoint.ImagesEdits,
  );
}

export function selectPreferredRequestEndpoint(
  endpoints?: readonly string[],
  options?: {
    preferResponses?: boolean;
    modelName?: string;
  },
): string | undefined {
  const preferredTextEndpoint = selectPreferredTextEndpoint(endpoints, options);
  if (preferredTextEndpoint) return preferredTextEndpoint;
  if (supportsImageGenerationEndpoint(endpoints)) {
    return SupportedEndpoint.ImagesGenerations;
  }
  return undefined;
}
