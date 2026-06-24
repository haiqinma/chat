import { PresetServer } from "./types";
import { type Lang } from "../locales";

const OFFICIAL_REPO_BASE =
  "https://github.com/modelcontextprotocol/servers/tree/main/src";

const OFFICIAL_TOOL_DISPLAY_TEXT: Record<
  string,
  Partial<Record<Lang, Pick<PresetServer, "name" | "description">>>
> = {
  "brave-search": {
    cn: {
      name: "Brave 搜索",
      description: "使用 Brave Search API 进行网页搜索。",
    },
  },
  fetch: {
    cn: {
      name: "网页抓取",
      description: "抓取并转换网页内容，用于阅读、总结和调研。",
    },
  },
  filesystem: {
    cn: {
      name: "文件系统",
      description: "在允许的目录内读取和写入文件。",
    },
  },
  git: {
    cn: {
      name: "Git",
      description: "检查和操作本地 Git 仓库。",
    },
  },
  memory: {
    cn: {
      name: "记忆",
      description: "基于本地知识图谱的持久记忆工具。",
    },
  },
  sequentialthinking: {
    cn: {
      name: "顺序思考",
      description: "用于分步骤推理和结构化解题。",
    },
  },
  time: {
    cn: {
      name: "时间",
      description: "提供时区和当前时间工具。",
    },
  },
  everything: {
    cn: {
      name: "工具协议测试合集",
      description: "用于测试 MCP 协议大部分能力的参考服务器。",
    },
  },
};

export const OFFICIAL_TOOL_PRESET_SERVERS: PresetServer[] = [
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Official Brave tool server for web search using the Brave Search API.",
    repo: "https://github.com/brave/brave-search-mcp-server",
    tags: ["official", "search", "web"],
    command: "npx",
    baseArgs: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"],
    configurable: true,
    configSchema: {
      properties: {
        braveApiKey: {
          type: "string",
          description: "Brave Search API Key.",
          required: true,
          helpUrl: "https://api-dashboard.search.brave.com/login",
          helpLabel: "Get API Key",
        },
      },
    },
    argsMapping: {
      braveApiKey: {
        type: "env",
        key: "BRAVE_API_KEY",
      },
    },
  },
  {
    id: "fetch",
    name: "Fetch",
    description:
      "Official tool server for fetching and converting web content.",
    repo: `${OFFICIAL_REPO_BASE}/fetch`,
    tags: ["official", "web", "http"],
    command: "mcp-server-fetch",
    baseArgs: [],
    configurable: false,
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Official tool server for reading and writing files within allowed directories.",
    repo: `${OFFICIAL_REPO_BASE}/filesystem`,
    tags: ["official", "local", "files"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-filesystem"],
    configurable: true,
    configSchema: {
      properties: {
        paths: {
          type: "array",
          description:
            "Allowed root directories. This client does not provide MCP Roots, so at least one path is required.",
          required: true,
          minItems: 1,
          itemLabel: "Path",
          addButtonText: "Add Path",
        },
      },
    },
    argsMapping: {
      paths: {
        type: "spread",
        position: 2,
      },
    },
  },
  {
    id: "git",
    name: "Git",
    description:
      "Official tool server for inspecting and operating on a local Git repository.",
    repo: `${OFFICIAL_REPO_BASE}/git`,
    tags: ["official", "local", "git"],
    command: "uvx",
    baseArgs: ["mcp-server-git", "--repository", ""],
    configurable: true,
    configSchema: {
      properties: {
        repository: {
          type: "string",
          description: "Absolute path to the local Git repository.",
          required: true,
        },
      },
    },
    argsMapping: {
      repository: {
        type: "single",
        position: 2,
      },
    },
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Official tool server for persistent memory backed by a local knowledge graph.",
    repo: `${OFFICIAL_REPO_BASE}/memory`,
    tags: ["official", "memory", "knowledge-graph"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-memory"],
    configurable: false,
  },
  {
    id: "sequentialthinking",
    name: "Sequential Thinking",
    description:
      "Official tool server for step-by-step reasoning and structured problem solving.",
    repo: `${OFFICIAL_REPO_BASE}/sequentialthinking`,
    tags: ["official", "reasoning", "tools"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    configurable: false,
  },
  {
    id: "time",
    name: "Time",
    description:
      "Official tool server for timezone and current time utilities.",
    repo: `${OFFICIAL_REPO_BASE}/time`,
    tags: ["official", "time", "timezone"],
    command: "uvx",
    baseArgs: ["mcp-server-time"],
    configurable: false,
  },
  {
    id: "everything",
    name: "Everything",
    description:
      "Official tool protocol reference server that exercises most protocol features for testing.",
    repo: `${OFFICIAL_REPO_BASE}/everything`,
    tags: ["official", "reference", "testing"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-everything"],
    configurable: false,
  },
];

export function getOfficialToolPresetServers(lang: Lang): PresetServer[] {
  return OFFICIAL_TOOL_PRESET_SERVERS.map((server) => ({
    ...server,
    ...OFFICIAL_TOOL_DISPLAY_TEXT[server.id]?.[lang],
  }));
}
