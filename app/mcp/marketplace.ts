import {
  fetchMarketplaceJson,
  type MarketplaceLoadResult,
} from "../marketplace/sources";
import { getLang } from "../locales";
import { resolveLocalizedText, type LocalizedText } from "../skills";
import { PresetServer } from "./types";

type MarketplaceConfigProperty = {
  type: string;
  description?: LocalizedText;
  required?: boolean;
  minItems?: number;
  itemLabel?: LocalizedText;
  addButtonText?: LocalizedText;
  helpUrl?: string;
  helpLabel?: LocalizedText;
};

type MarketplaceMcpServer = Omit<
  PresetServer,
  "name" | "description" | "configSchema"
> & {
  name: LocalizedText;
  description: LocalizedText;
  configSchema?: {
    properties: Record<string, MarketplaceConfigProperty>;
  };
  schemaVersion?: string;
  version?: string;
  release?: {
    status?: "published" | "draft" | "removed";
    review?: "approved" | "pending" | "rejected";
  };
};

function isValidPresetServer(
  server: MarketplaceMcpServer,
): server is MarketplaceMcpServer {
  return Boolean(
    server &&
    typeof server.id === "string" &&
    server.name &&
    server.description &&
    typeof server.repo === "string" &&
    Array.isArray(server.tags) &&
    typeof server.command === "string" &&
    Array.isArray(server.baseArgs) &&
    typeof server.configurable === "boolean",
  );
}

function normalizeMcpConfigSchema(
  schema: MarketplaceMcpServer["configSchema"],
  lang: ReturnType<typeof getLang>,
): PresetServer["configSchema"] {
  if (!schema?.properties) return undefined;

  return {
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, prop]) => [
        key,
        {
          ...prop,
          description: resolveLocalizedText(prop.description, lang),
          itemLabel: resolveLocalizedText(prop.itemLabel, lang),
          addButtonText: resolveLocalizedText(prop.addButtonText, lang),
          helpLabel: resolveLocalizedText(prop.helpLabel, lang),
        },
      ]),
    ),
  };
}

function normalizeMcpServer(server: MarketplaceMcpServer): PresetServer {
  const lang = getLang();

  return {
    ...server,
    name: resolveLocalizedText(server.name, lang, server.id),
    description: resolveLocalizedText(server.description, lang),
    configSchema: normalizeMcpConfigSchema(server.configSchema, lang),
  };
}

function filterMarketplaceMcpServers(servers: MarketplaceMcpServer[]) {
  if (!Array.isArray(servers)) return [];

  return servers
    .filter((server) => {
      if (server.release?.status && server.release.status !== "published") {
        return false;
      }
      return isValidPresetServer(server);
    })
    .map(normalizeMcpServer);
}

export async function fetchCommunityMcpPresetServers(
  signal?: AbortSignal,
): Promise<MarketplaceLoadResult<PresetServer[]>> {
  const result = await fetchMarketplaceJson<MarketplaceMcpServer[]>(
    "mcp",
    signal,
  );

  return {
    ...result,
    data: filterMarketplaceMcpServers(result.data),
  };
}

export function mergeMcpPresetServers(
  officialServers: PresetServer[],
  communityServers: PresetServer[],
) {
  const merged = new Map<string, PresetServer>();
  communityServers.forEach((server) => merged.set(server.id, server));
  officialServers.forEach((server) => merged.set(server.id, server));
  return Array.from(merged.values());
}
