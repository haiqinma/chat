import { BuiltinSkill } from "./typing";
import { CHAT_TOOLBAR_PRESETS, createBuiltinSkill } from "./utils";
import { ServiceProvider } from "../constant";

export const CN_SKILLS: BuiltinSkill[] = [
  createBuiltinSkill({
    avatar: "26a1",
    name: "通用问答",
    description: "没有固定套路，适合日常问答、临时想法和快速处理。",
    category: "基础",
    starters: [
      "帮我把这个问题想清楚，先给结论。",
      "把下面内容整理成清晰的要点。",
      "按当前信息先推进，缺少关键信息再问我。",
    ],
    lang: "cn",
    createdAt: 1700000001001,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.general,
    },
    context: [
      {
        id: "cn-general-0",
        role: "system",
        content:
          "你是一个面向结果的通用 AI。先理解用户目标，再给出清晰、可执行的回答。信息不足时，只追问最关键的问题；如果可以基于合理假设继续，就先说明假设并推进。避免空话和重复，优先输出结论、步骤、风险和下一步。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.4,
      historyMessageCount: 12,
    },
  }),
  createBuiltinSkill({
    avatar: "1f50d",
    name: "网页调研",
    description: "搜索网页、抓取来源、对比总结，适合需要最新资料的问题。",
    category: "研究",
    starters: [
      "请先搜索这个主题，再抓取最相关的两个来源并对比总结。",
      "围绕这个问题做多来源调研，输出结论、证据和不确定点。",
      "帮我查找最新资料，并附上来源链接。",
    ],
    lang: "cn",
    createdAt: 1700000001002,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    tools: {
      mcpTools: ["brave-search", "fetch"],
    },
    toolStrategy: {
      nativeMcpTools: "auto",
    },
    context: [
      {
        id: "cn-web-research-0",
        role: "system",
        content:
          "你正在执行网页研究任务。需要最新信息、公开网页资料、技术调研或产品对比时，优先使用网页搜索工具找来源，再用网页抓取工具读取原文。不要把搜索结果页当作正文来源。回答时先给结论，再列关键证据、差异、不确定点和来源链接。工具不可用、来源不足或抓取失败时，要直接说明，不要捏造来源。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.25,
      max_tokens: 6000,
      historyMessageCount: 10,
    },
  }),
  createBuiltinSkill({
    avatar: "1f4c4",
    name: "阅读总结",
    description: "读取网页、文档或长文本，提炼摘要、结构和行动项。",
    category: "阅读",
    starters: [
      "抓取这个网页并用中文总结重点。",
      "阅读下面这段长文，提炼摘要、关键结论和待办事项。",
      "把这份材料整理成适合汇报的结构。",
    ],
    lang: "cn",
    createdAt: 1700000001003,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    context: [
      {
        id: "cn-reading-0",
        role: "system",
        content:
          "你正在执行阅读总结任务。优先保留原文事实、结构和关键结论，区分原文观点与自己的分析。默认输出：一句话摘要、关键要点、重要细节、可执行事项、仍需确认的问题。不要擅自补充原文没有的信息；如果材料来自网页，尽量附来源链接。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.3,
      max_tokens: 5000,
      historyMessageCount: 8,
    },
  }),
  createBuiltinSkill({
    avatar: "2696-fe0f",
    name: "方案对比",
    description: "把多个产品、技术或决策选项放在同一标准下比较。",
    category: "分析",
    starters: [
      "对比这几个方案，给出评价维度、优缺点和推荐结论。",
      "帮我把这两个产品按价格、能力、限制和适用场景做表格对比。",
      "先定义判断标准，再分析哪个方案更适合我。",
    ],
    lang: "cn",
    createdAt: 1700000001004,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    context: [
      {
        id: "cn-compare-0",
        role: "system",
        content:
          "你正在执行方案对比任务。先明确用户目标和评价维度，再比较各选项的能力、成本、限制、风险和适用场景。默认输出：结论、对比表、关键取舍、推荐方案、下一步验证。事实不足时明确标注假设；涉及最新信息时优先使用搜索和抓取工具核实。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.3,
      max_tokens: 5000,
      historyMessageCount: 10,
    },
  }),
  createBuiltinSkill({
    avatar: "1f9e0",
    name: "深度思考",
    description:
      "启用支持推理模型的深度思考能力，适合复杂分析、规划和高难度问题。",
    category: "分析",
    starters: [
      "深入分析这个问题，先拆解关键变量，再给结论。",
      "请用更强推理模式解决这个复杂任务。",
      "帮我做一次系统性推演，列出假设、推理过程和风险。",
    ],
    lang: "cn",
    createdAt: 1700000001006,
    syncGlobalConfig: false,
    candidateModels: [{ capability: "reasoning" }],
    toolStrategy: {
      nativeMcpTools: "auto",
    },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.reasoning,
    },
    context: [
      {
        id: "cn-deep-reasoning-0",
        role: "system",
        content:
          "你正在执行深度思考任务。先识别问题类型和关键约束，再进行结构化分析。输出时区分事实、假设、推理和结论；复杂问题需要给出取舍、风险和下一步验证。不要为了显得复杂而拉长回答，重点保证推理链条清晰、结论可执行。",
        date: "",
      },
    ],
    modelConfig: {
      reasoningMode: "on",
      reasoningEffort: "high",
      temperature: 0.2,
      max_tokens: 8000,
      historyMessageCount: 12,
    },
  }),
  createBuiltinSkill({
    avatar: "1f5bc-fe0f",
    name: "AI绘画",
    description: "围绕画面创意、提示词和生成参数来组织一次图片创作会话。",
    category: "创作",
    starters: [
      "给我生成一张海报风格的封面，先补全高质量提示词。",
      "把这个产品想法转成适合图片模型的生成提示词。",
      "先给我 3 个不同画风方向，再按我选的方向继续生成。",
    ],
    lang: "cn",
    createdAt: 1700000001005,
    syncGlobalConfig: false,
    launch: { type: "sd" },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.image,
    },
    context: [
      {
        id: "cn-image-0",
        role: "system",
        content:
          "你是图片创作助手。根据用户目标生成清晰、可执行的画面提示词，必要时补充风格、构图、光线、材质、文字和负面约束。回答保持简洁，优先服务于下一次图片生成。",
        date: "",
      },
    ],
    modelConfig: {
      model: "gpt-image-1",
      providerName: ServiceProvider.OpenAI,
      temperature: 0.7,
      historyMessageCount: 6,
      size: "1024x1024",
      quality: "auto",
      style: "vivid",
    },
  }),
];
