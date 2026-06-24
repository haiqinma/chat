import {
  executeToolAction,
  getAllTools,
  isToolRuntimeEnabled,
} from "../tools/actions";
import { ServiceProvider } from "../constant";
import {
  normalizeModelEndpointPath,
  SupportedTextEndpoint,
} from "../client/api";
import { FunctionToolItem, usePluginStore } from "./plugin";

export type NativeToolBundle = [
  FunctionToolItem[],
  Record<string, (args: Record<string, unknown>) => Promise<any>>,
];

const TOOL_FUNCTION_NAME_PREFIX = "mcp__";

export function shouldUseNativeToolBridge(config: {
  providerName?: string;
  endpointPath?: string;
}) {
  const endpointPath = normalizeModelEndpointPath(config.endpointPath);
  if (config.providerName === ServiceProvider.OpenAI) {
    return endpointPath !== SupportedTextEndpoint.Messages;
  }
  if (config.providerName === ServiceProvider.Anthropic) {
    return endpointPath === SupportedTextEndpoint.Messages;
  }
  return false;
}

function createToolFunctionName(clientId: string, toolName: string) {
  return `${TOOL_FUNCTION_NAME_PREFIX}${clientId}__${toolName}`;
}

export async function getNativeToolBundle(
  pluginIds: string[],
  options?: {
    includeToolServers?: boolean;
    toolServerIds?: string[];
  },
): Promise<NativeToolBundle> {
  const pluginPair = usePluginStore.getState().getAsTools(pluginIds) as [
    FunctionToolItem[],
    Record<string, (args: Record<string, unknown>) => Promise<any>>,
  ];

  const tools = [...(pluginPair[0] ?? [])];
  const funcs = { ...(pluginPair[1] ?? {}) };

  if (!options?.includeToolServers) {
    return [tools, funcs];
  }

  const toolRuntimeEnabled = await isToolRuntimeEnabled();
  if (!toolRuntimeEnabled) {
    return [tools, funcs];
  }

  const selectedToolServerIds = new Set(options.toolServerIds ?? []);
  const toolClients = (await getAllTools()).filter(
    (client) =>
      selectedToolServerIds.size === 0 ||
      selectedToolServerIds.has(client.clientId),
  );

  toolClients.forEach((client) => {
    const clientTools = client.tools?.tools;
    if (!Array.isArray(clientTools)) return;

    clientTools.forEach((tool) => {
      if (!tool?.name || typeof tool.name !== "string") return;

      const functionName = createToolFunctionName(client.clientId, tool.name);

      tools.push({
        type: "function",
        function: {
          name: functionName,
          description: [
            `Tool client: ${client.clientId}`,
            tool.description || "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          parameters: tool.inputSchema || {
            type: "object",
            properties: {},
            required: [],
          },
        },
      });

      funcs[functionName] = async (args: Record<string, unknown>) => {
        const result = await executeToolAction(client.clientId, {
          method: "tools/call",
          params: {
            name: tool.name,
            arguments: args,
          },
        });

        return {
          status: 200,
          data: result,
        };
      };
    });
  });

  return [tools, funcs];
}
