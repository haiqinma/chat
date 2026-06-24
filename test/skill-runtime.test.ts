import {
  hasSkillToolRuntimeIssue,
  resolveSkillRuntimeStatus,
} from "../app/skills/runtime";
import { ServiceProvider } from "../app/constant";
import type { LLMModel } from "../app/client/api";
import type { ModelConfig } from "../app/store/config";
import type { Skill } from "../app/store/skill";

const model: LLMModel = {
  name: "gpt-5.4",
  available: true,
  sorted: 1,
  provider: {
    id: "openai",
    providerName: ServiceProvider.OpenAI,
    providerType: "openai",
    sorted: 1,
  },
};

const modelConfig: ModelConfig = {
  model: "gpt-5.4",
  providerName: ServiceProvider.OpenAI,
  temperature: 0.5,
  top_p: 1,
  max_tokens: 4000,
  presence_penalty: 0,
  frequency_penalty: 0,
  reasoningMode: "off",
  reasoningEffort: "medium",
  sendMemory: true,
  historyMessageCount: 4,
  compressMessageLengthThreshold: 1000,
  compressModel: "",
  compressProviderName: "",
  enableInjectSystemPrompts: true,
  template: "{{input}}",
  size: "1024x1024",
  quality: "auto",
};

const baseSkill: Skill = {
  id: "research",
  avatar: "1f9e0",
  name: "阅读总结",
  context: [],
  syncGlobalConfig: true,
  modelConfig,
  lang: "cn",
  builtin: false,
  createdAt: 1,
  hideContext: false,
  tools: {
    toolServers: ["fetch"],
  },
};

function resolve(overrides: Parameters<typeof resolveSkillRuntimeStatus>[0]) {
  return resolveSkillRuntimeStatus({
    skill: baseSkill,
    models: [model],
    globalModelConfig: modelConfig,
    installedPluginIds: [],
    installedToolServerIds: ["fetch"],
    ...overrides,
  });
}

describe("skill runtime checks", () => {
  test("does not report inactive tool before status is loaded", () => {
    const result = resolve({});

    expect(result.status).toBe("ready");
    expect(hasSkillToolRuntimeIssue(result)).toBe(false);
  });

  test("reports missing tool configuration", () => {
    const result = resolve({ installedToolServerIds: [] });

    expect(result.status).toBe("needs_config");
    expect(result.issues).toEqual([
      { type: "tool_missing", message: "缺少 1 个工具配置" },
    ]);
    expect(hasSkillToolRuntimeIssue(result)).toBe(true);
  });

  test("reports configured but inactive tool", () => {
    const result = resolve({
      toolStatuses: {
        fetch: {
          status: "error",
          errorMsg: "Request timeout",
        },
      },
    });

    expect(result.status).toBe("needs_config");
    expect(result.issues).toEqual([
      { type: "tool_inactive", message: "1 个工具未正常运行" },
    ]);
    expect(hasSkillToolRuntimeIssue(result)).toBe(true);
  });

  test("does not block SD workspace skill on chat model matching", () => {
    const result = resolve({
      skill: {
        ...baseSkill,
        id: "image",
        name: "AI绘画",
        launch: { type: "sd" },
        syncGlobalConfig: false,
        modelConfig: {
          ...modelConfig,
          model: "gpt-image-1",
          providerName: ServiceProvider.OpenAI,
        },
        tools: {
          builtInTools: [],
          toolServers: [],
          apiTools: [],
        },
      },
      models: [model],
      installedToolServerIds: [],
    });

    expect(result.status).toBe("ready");
    expect(result.issues).toEqual([]);
  });
});
