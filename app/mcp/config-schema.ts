export type McpConfigPropertyLike = {
  type: string;
  required?: boolean;
  minItems?: number;
};

export function readMcpConfigBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function stringifyMcpConfigValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

export function getMissingMcpConfigKeys(
  properties: Record<string, McpConfigPropertyLike>,
  values: Record<string, unknown>,
) {
  return Object.entries(properties)
    .filter(([, property]) => property.required)
    .filter(([key, property]) => {
      const value = values[key];

      if (property.type === "array") {
        if (!Array.isArray(value)) return true;
        const minItems = property.minItems ?? 1;
        return value.filter((item) => String(item).trim()).length < minItems;
      }

      if (property.type === "boolean") {
        return false;
      }

      return typeof value !== "string" || value.trim().length === 0;
    })
    .map(([key]) => key);
}
