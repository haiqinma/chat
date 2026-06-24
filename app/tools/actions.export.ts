import {
  DEFAULT_TOOL_CONFIG,
  ListToolsResponse,
  ToolConfigData,
  McpRequestMessage,
  ServerConfig,
  ServerStatusResponse,
} from "./types";

function disabledError() {
  return new Error("Tool runtime is not available in desktop export builds");
}

export async function getClientsStatus(): Promise<
  Record<string, ServerStatusResponse>
> {
  return {};
}

export async function getClientTools(_clientId: string) {
  return null;
}

export async function getAvailableClientsCount() {
  return 0;
}

export async function getAllTools() {
  return [] as { clientId: string; tools: ListToolsResponse | null }[];
}

export async function initializeToolSystem(): Promise<ToolConfigData> {
  return DEFAULT_TOOL_CONFIG;
}

export async function addToolServer(
  _clientId: string,
  _config: ServerConfig,
): Promise<ToolConfigData> {
  throw disabledError();
}

export async function pauseToolServer(
  _clientId: string,
): Promise<ToolConfigData> {
  throw disabledError();
}

export async function resumeToolServer(_clientId: string): Promise<void> {
  throw disabledError();
}

export async function removeToolServer(
  _clientId: string,
): Promise<ToolConfigData> {
  throw disabledError();
}

export async function restartAllClients(): Promise<ToolConfigData> {
  throw disabledError();
}

export async function executeToolAction(
  _clientId: string,
  _request: McpRequestMessage,
) {
  throw disabledError();
}

export async function getToolConfigFromFile(): Promise<ToolConfigData> {
  return DEFAULT_TOOL_CONFIG;
}

export async function isToolRuntimeEnabled(): Promise<boolean> {
  return false;
}
