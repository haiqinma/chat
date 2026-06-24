import {
  disablePlainChatReasoning,
  isLegacyPlainChatSkill,
  isPlainChatSkill,
} from "../app/utils/plain-chat";
import { ServiceProvider } from "../app/constant";
import type { ModelConfig } from "../app/store/config";
import type { Skill } from "../app/store/skill";

const modelConfig: ModelConfig = {
  model: "gpt-5.4",
  providerName: ServiceProvider.OpenAI,
  temperature: 0.5,
  top_p: 1,
  max_tokens: 4000,
  presence_penalty: 0,
  frequency_penalty: 0,
  reasoningMode: "on",
  reasoningEffort: "high",
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

const plainSkill: Skill = {
  id: "plain",
  avatar: "gpt-bot",
  name: "新的聊天",
  context: [],
  syncGlobalConfig: true,
  modelConfig,
  candidateModels: [],
  lang: "cn",
  builtin: false,
  createdAt: 1,
  plugin: [],
  tools: {
    builtInTools: [],
    toolServers: [],
    apiTools: [],
  },
};

describe("plain chat reasoning isolation", () => {
  test("disables reasoning for ordinary chat config", () => {
    expect(disablePlainChatReasoning(modelConfig)).toMatchObject({
      reasoningMode: "off",
      reasoningEffort: "high",
    });
  });

  test("detects ordinary chat skill", () => {
    expect(isPlainChatSkill(plainSkill)).toBe(true);
    expect(isLegacyPlainChatSkill(plainSkill)).toBe(true);
  });

  test("detects legacy chat skill with old web search tool", () => {
    expect(
      isLegacyPlainChatSkill({
        ...plainSkill,
        tools: {
          builtInTools: ["web_search"],
          toolServers: [],
          apiTools: [],
        },
      }),
    ).toBe(true);
  });

  test("does not treat prompted skill as ordinary chat", () => {
    expect(
      isPlainChatSkill({
        ...plainSkill,
        context: [
          {
            id: "system",
            role: "system",
            content: "Use deep reasoning.",
            date: "",
          },
        ],
      }),
    ).toBe(false);
  });

  test("does not treat installed general chat as legacy chat", () => {
    expect(
      isLegacyPlainChatSkill({
        ...plainSkill,
        id: "general",
        name: "通用问答",
        packageId: "builtin.cn.1700000001001",
        category: "基础",
        description: "日常问答、写作、分析和轻量任务处理。",
      }),
    ).toBe(false);
  });
});
