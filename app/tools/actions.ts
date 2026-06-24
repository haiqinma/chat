"use server";
import {
  createClient,
  executeRequest,
  listTools,
  removeClient,
} from "./client";
import { ToolClientLogger } from "./logger";
import {
  DEFAULT_TOOL_CONFIG,
  ToolClientData,
  ToolConfigData,
  McpRequestMessage,
  ServerConfig,
  ServerStatusResponse,
} from "./types";
import fs from "fs/promises";
import path from "path";
import { getServerSideConfig } from "../config/server";

const logger = new ToolClientLogger("Tool Actions");
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "data/tool_config.json");
const TOOL_INIT_MAX_ATTEMPTS = 2;
const TOOL_INIT_RETRY_DELAY_MS = 1500;

const clientsMap = new Map<string, ToolClientData>();

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getToolConfigPath() {
  const configuredPath = process.env.TOOL_CONFIG_PATH?.trim();
  if (!configuredPath) return DEFAULT_CONFIG_PATH;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

function normalizeToolConfig(raw: unknown): ToolConfigData {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_TOOL_CONFIG;
  }

  const config = raw as Partial<ToolConfigData>;

  return {
    toolServers: config.toolServers ?? {},
  };
}

async function syncServerStatus(
  clientId: string,
  status: ServerConfig["status"],
): Promise<void> {
  const currentConfig = await getToolConfigFromFile();
  const serverConfig = currentConfig.toolServers[clientId];
  if (!serverConfig || serverConfig.status === status) {
    return;
  }

  await updateToolConfig({
    ...currentConfig,
    toolServers: {
      ...currentConfig.toolServers,
      [clientId]: {
        ...serverConfig,
        status,
      },
    },
  });
}

// 获取客户端状态
export async function getClientsStatus(): Promise<
  Record<string, ServerStatusResponse>
> {
  const config = await getToolConfigFromFile();
  const result: Record<string, ServerStatusResponse> = {};

  for (const clientId of Object.keys(config.toolServers)) {
    const status = clientsMap.get(clientId);
    const serverConfig = config.toolServers[clientId];

    if (!serverConfig) {
      result[clientId] = { status: "undefined", errorMsg: null };
      continue;
    }

    if (serverConfig.status === "paused") {
      result[clientId] = { status: "paused", errorMsg: null };
      continue;
    }

    if (!status) {
      result[clientId] = { status: "undefined", errorMsg: null };
      continue;
    }

    if (
      status.client === null &&
      status.tools === null &&
      status.errorMsg === null
    ) {
      result[clientId] = { status: "initializing", errorMsg: null };
      continue;
    }

    if (status.errorMsg) {
      result[clientId] = { status: "error", errorMsg: status.errorMsg };
      continue;
    }

    if (status.client) {
      result[clientId] = { status: "active", errorMsg: null };
      continue;
    }

    result[clientId] = { status: "error", errorMsg: "Client not found" };
  }

  return result;
}

// 获取客户端工具
export async function getClientTools(clientId: string) {
  return clientsMap.get(clientId)?.tools ?? null;
}

// 获取可用客户端数量
export async function getAvailableClientsCount() {
  let count = 0;
  clientsMap.forEach((map) => !map.errorMsg && count++);
  return count;
}

// 获取所有客户端工具
export async function getAllTools() {
  const result = [];
  for (const [clientId, status] of clientsMap.entries()) {
    result.push({
      clientId,
      tools: status.tools,
    });
  }
  return result;
}

// 初始化单个客户端
async function initializeSingleClient(
  clientId: string,
  serverConfig: ServerConfig,
) {
  // 如果服务器状态是暂停，则不初始化
  if (serverConfig.status === "paused") {
    logger.info(`Skipping initialization for paused client [${clientId}]`);
    return;
  }

  logger.info(`Initializing client [${clientId}]...`);

  // 先设置初始化状态
  clientsMap.set(clientId, {
    client: null,
    tools: null,
    errorMsg: null, // null 表示正在初始化
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= TOOL_INIT_MAX_ATTEMPTS; attempt++) {
    let client = null;
    try {
      logger.info(
        `Connecting client [${clientId}] (attempt ${attempt}/${TOOL_INIT_MAX_ATTEMPTS})...`,
      );
      client = await createClient(clientId, serverConfig);
      const tools = await listTools(client);
      logger.info(
        `Supported tools for [${clientId}]: ${JSON.stringify(tools, null, 2)}`,
      );
      clientsMap.set(clientId, { client, tools, errorMsg: null });
      await syncServerStatus(clientId, "active");
      logger.success(`Client [${clientId}] initialized successfully`);
      return;
    } catch (error) {
      lastError = error;
      const message = getErrorMessage(error);

      if (client) {
        try {
          await removeClient(client);
        } catch (removeError) {
          logger.warn(
            `Failed to clean up client [${clientId}] after init error: ${removeError}`,
          );
        }
      }

      if (attempt < TOOL_INIT_MAX_ATTEMPTS) {
        logger.warn(
          `Failed to initialize client [${clientId}] on attempt ${attempt}: ${message}. Retrying in ${TOOL_INIT_RETRY_DELAY_MS}ms...`,
        );
        await sleep(TOOL_INIT_RETRY_DELAY_MS);
        clientsMap.set(clientId, {
          client: null,
          tools: null,
          errorMsg: null,
        });
        continue;
      }
    }
  }

  const errorMsg = getErrorMessage(lastError);
  clientsMap.set(clientId, {
    client: null,
    tools: null,
    errorMsg,
  });
  await syncServerStatus(clientId, "error");
  logger.error(`Failed to initialize client [${clientId}]: ${errorMsg}`);
  throw new Error(errorMsg);
}

// 初始化系统
export async function initializeToolSystem() {
  logger.info("Tool runtime starting...");
  try {
    // 检查是否已有活跃的客户端
    if (clientsMap.size > 0) {
      logger.info("Tool runtime already initialized, skipping...");
      return;
    }

    const config = await getToolConfigFromFile();
    // 初始化所有客户端
    for (const [clientId, serverConfig] of Object.entries(config.toolServers)) {
      try {
        await initializeSingleClient(clientId, serverConfig);
      } catch (error) {
        logger.error(
          `Client [${clientId}] failed during tool runtime bootstrap: ${getErrorMessage(error)}`,
        );
      }
    }
    return config;
  } catch (error) {
    logger.error(`Failed to initialize tool runtime: ${error}`);
    throw error;
  }
}

// 添加服务器
export async function addToolServer(clientId: string, config: ServerConfig) {
  try {
    const currentConfig = await getToolConfigFromFile();
    const isNewServer = !(clientId in currentConfig.toolServers);

    // 如果是新服务器，设置默认状态为 active
    if (isNewServer && !config.status) {
      config.status = "active";
    }

    const newConfig = {
      ...currentConfig,
      toolServers: {
        ...currentConfig.toolServers,
        [clientId]: config,
      },
    };
    await updateToolConfig(newConfig);

    // 只有新服务器或状态为 active 的服务器才初始化
    if (isNewServer || config.status === "active") {
      await initializeSingleClient(clientId, config);
    }

    return newConfig;
  } catch (error) {
    logger.error(`Failed to add server [${clientId}]: ${error}`);
    throw error;
  }
}

// 暂停服务器
export async function pauseToolServer(clientId: string) {
  try {
    const currentConfig = await getToolConfigFromFile();
    const serverConfig = currentConfig.toolServers[clientId];
    if (!serverConfig) {
      throw new Error(`Server ${clientId} not found`);
    }

    // 先更新配置
    const newConfig: ToolConfigData = {
      ...currentConfig,
      toolServers: {
        ...currentConfig.toolServers,
        [clientId]: {
          ...serverConfig,
          status: "paused",
        },
      },
    };
    await updateToolConfig(newConfig);

    // 然后关闭客户端
    const client = clientsMap.get(clientId);
    if (client?.client) {
      await removeClient(client.client);
    }
    clientsMap.delete(clientId);

    return newConfig;
  } catch (error) {
    logger.error(`Failed to pause server [${clientId}]: ${error}`);
    throw error;
  }
}

// 恢复服务器
export async function resumeToolServer(clientId: string): Promise<void> {
  try {
    const currentConfig = await getToolConfigFromFile();
    const serverConfig = currentConfig.toolServers[clientId];
    if (!serverConfig) {
      throw new Error(`Server ${clientId} not found`);
    }

    // 先尝试初始化客户端
    logger.info(`Trying to initialize client [${clientId}]...`);
    try {
      await initializeSingleClient(clientId, serverConfig);
    } catch (error) {
      const currentConfig = await getToolConfigFromFile();
      const serverConfig = currentConfig.toolServers[clientId];

      // 如果配置中存在该服务器，则更新其状态为 error
      if (serverConfig) {
        serverConfig.status = "error";
        await updateToolConfig(currentConfig);
      }

      // 初始化失败
      clientsMap.set(clientId, {
        client: null,
        tools: null,
        errorMsg: getErrorMessage(error),
      });
      logger.error(`Failed to initialize client [${clientId}]: ${error}`);
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to resume server [${clientId}]: ${error}`);
    throw error;
  }
}

// 移除服务器
export async function removeToolServer(clientId: string) {
  try {
    const currentConfig = await getToolConfigFromFile();
    const { [clientId]: _, ...rest } = currentConfig.toolServers;
    const newConfig = {
      ...currentConfig,
      toolServers: rest,
    };
    await updateToolConfig(newConfig);

    // 关闭并移除客户端
    const client = clientsMap.get(clientId);
    if (client?.client) {
      await removeClient(client.client);
    }
    clientsMap.delete(clientId);

    return newConfig;
  } catch (error) {
    logger.error(`Failed to remove server [${clientId}]: ${error}`);
    throw error;
  }
}

// 重启所有客户端
export async function restartAllClients() {
  logger.info("Restarting all clients...");
  try {
    // 关闭所有客户端
    for (const client of clientsMap.values()) {
      if (client.client) {
        await removeClient(client.client);
      }
    }

    // 清空状态
    clientsMap.clear();

    // 重新初始化
    const config = await getToolConfigFromFile();
    for (const [clientId, serverConfig] of Object.entries(config.toolServers)) {
      await initializeSingleClient(clientId, serverConfig);
    }
    return config;
  } catch (error) {
    logger.error(`Failed to restart clients: ${error}`);
    throw error;
  }
}

// 执行工具请求。请求体仍遵循 MCP JSON-RPC 协议。
export async function executeToolAction(
  clientId: string,
  request: McpRequestMessage,
) {
  try {
    const client = clientsMap.get(clientId);
    if (!client?.client) {
      throw new Error(`Client ${clientId} not found`);
    }
    logger.info(`Executing request for [${clientId}]`);
    return await executeRequest(client.client, request);
  } catch (error) {
    logger.error(`Failed to execute request for [${clientId}]: ${error}`);
    throw error;
  }
}

// 获取工具配置文件
export async function getToolConfigFromFile(): Promise<ToolConfigData> {
  const configPath = getToolConfigPath();

  try {
    const configStr = await fs.readFile(configPath, "utf-8");
    return normalizeToolConfig(JSON.parse(configStr));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      await updateToolConfig(DEFAULT_TOOL_CONFIG);
      logger.info(`Created default tool config at ${configPath}`);
      return DEFAULT_TOOL_CONFIG;
    }

    logger.error(`Failed to load tool config, using default config: ${error}`);
    return DEFAULT_TOOL_CONFIG;
  }
}

// 更新工具配置文件
async function updateToolConfig(config: ToolConfigData): Promise<void> {
  try {
    const configPath = getToolConfigPath();
    // 确保目录存在
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw error;
  }
}

// 检查工具运行时是否启用
export async function isToolRuntimeEnabled() {
  try {
    const serverConfig = getServerSideConfig();
    return serverConfig.enableTools;
  } catch (error) {
    logger.error(`Failed to check tool runtime status: ${error}`);
    return false;
  }
}
