// ref: https://spec.modelcontextprotocol.io/specification/basic/messages/

import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface McpRequestMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  method: "tools/call" | string;
  params?: {
    [key: string]: unknown;
  };
}

export const McpRequestMessageSchema: z.ZodType<McpRequestMessage> = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export interface McpResponseMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  result?: {
    [key: string]: unknown;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const McpResponseMessageSchema: z.ZodType<McpResponseMessage> = z.object(
  {
    jsonrpc: z.literal("2.0").optional(),
    id: z.union([z.string(), z.number()]).optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .optional(),
  },
);

export interface McpNotifications {
  jsonrpc?: "2.0";
  method: string;
  params?: {
    [key: string]: unknown;
  };
}

export const McpNotificationsSchema: z.ZodType<McpNotifications> = z.object({
  jsonrpc: z.literal("2.0").optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

////////////
// Next Chat
////////////
export interface ListToolsResponse {
  tools: {
    name?: string;
    description?: string;
    inputSchema?: object;
    [key: string]: any;
  };
}

export type ToolClientData =
  | ToolActiveClient
  | ToolErrorClient
  | ToolInitializingClient;

interface ToolInitializingClient {
  client: null;
  tools: null;
  errorMsg: null;
}

interface ToolActiveClient {
  client: Client;
  tools: ListToolsResponse;
  errorMsg: null;
}

interface ToolErrorClient {
  client: null;
  tools: null;
  errorMsg: string;
}

// 服务器状态类型
export type ServerStatus =
  | "undefined"
  | "active"
  | "paused"
  | "error"
  | "initializing";

export interface ServerStatusResponse {
  status: ServerStatus;
  errorMsg: string | null;
}

// 工具服务器配置相关类型
export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  status?: "active" | "paused" | "error";
}

export interface ToolConfigData {
  // Tool Server 的配置
  toolServers: Record<string, ServerConfig>;
}

export const DEFAULT_TOOL_CONFIG: ToolConfigData = {
  toolServers: {},
};

export interface ArgsMapping {
  // 参数映射的类型
  type: "spread" | "single" | "env";

  // 参数映射的位置
  position?: number;

  // 参数映射的 key
  key?: string;
}

export interface PresetServer {
  // Tool Server 的唯一标识，作为最终配置文件 Json 的 key
  id: string;

  // Tool Server 的显示名称
  name: string;

  // Tool Server 的描述
  description: string;

  // Tool Server 的仓库地址
  repo: string;

  // Tool Server 的标签
  tags: string[];

  // Tool Server 的命令
  command: string;

  // Tool Server 的参数
  baseArgs: string[];

  // Tool Server 是否需要配置
  configurable: boolean;

  // Tool Server 的配置 schema
  configSchema?: {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
        minItems?: number;
        itemLabel?: string;
        addButtonText?: string;
        helpUrl?: string;
        helpLabel?: string;
      }
    >;
  };

  // Tool Server 的参数映射
  argsMapping?: Record<string, ArgsMapping>;
}
