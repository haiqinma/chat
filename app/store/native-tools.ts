import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
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

const MCP_TOOL_NAME_PREFIX = "mcp__";

export function shouldUseNativeMcpTools(config: {
  providerName?: string;
  endpointPath?: string;
}) {
  const endpointPath = normalizeModelEndpointPath(config.endpointPath);
  if (config.providerName !== ServiceProvider.OpenAI) return false;
  return endpointPath !== SupportedTextEndpoint.Messages;
}

function createMcpToolFunctionName(clientId: string, toolName: string) {
  return `${MCP_TOOL_NAME_PREFIX}${clientId}__${toolName}`;
}

export async function getNativeToolBundle(
  pluginIds: string[],
  options?: {
    includeMcp?: boolean;
  },
): Promise<NativeToolBundle> {
  const pluginPair = usePluginStore.getState().getAsTools(pluginIds) as [
    FunctionToolItem[],
    Record<string, (args: Record<string, unknown>) => Promise<any>>,
  ];

  const tools = [...(pluginPair[0] ?? [])];
  const funcs = { ...(pluginPair[1] ?? {}) };

  if (!options?.includeMcp) {
    return [tools, funcs];
  }

  const mcpEnabled = await isMcpEnabled();
  if (!mcpEnabled) {
    return [tools, funcs];
  }

  const mcpClients = await getAllTools();

  mcpClients.forEach((client) => {
    const clientTools = client.tools?.tools;
    if (!Array.isArray(clientTools)) return;

    clientTools.forEach((tool) => {
      if (!tool?.name || typeof tool.name !== "string") return;

      const functionName = createMcpToolFunctionName(
        client.clientId,
        tool.name,
      );

      tools.push({
        type: "function",
        function: {
          name: functionName,
          description: [
            `MCP client: ${client.clientId}`,
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
        const result = await executeMcpAction(client.clientId, {
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
