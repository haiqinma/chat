import { BuiltinSkill } from "./typing";
import { CHAT_TOOLBAR_PRESETS, createBuiltinSkill } from "./utils";
import { ServiceProvider } from "../constant";
import {
  DEFAULT_ROUTER_REALTIME_MODEL,
  DEFAULT_ROUTER_REALTIME_VOICE,
  REALTIME_ROUTER_PROVIDER,
} from "../store/realtime";

export const EN_SKILLS: BuiltinSkill[] = [
  createBuiltinSkill({
    avatar: "26a1",
    name: "Direct Chat",
    description:
      "No fixed workflow. Best for everyday questions, rough ideas, and quick work.",
    category: "Basic",
    starters: [
      "Help me think through this and start with the conclusion.",
      "Turn the following content into clear bullet points.",
      "Use the current information first, and ask only if something critical is missing.",
    ],
    lang: "en",
    createdAt: 1700000002001,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.general,
    },
    context: [
      {
        id: "en-general-0",
        role: "system",
        content:
          "You are a results-oriented general AI. Understand the user's goal first, then provide a clear and actionable answer. If information is missing, ask only the most important question; if reasonable assumptions are enough to proceed, state them and continue. Avoid filler and repetition. Prefer conclusions, steps, risks, and next actions.",
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
    name: "Web Research",
    description:
      "Search the web, fetch source pages, compare findings, and cite links.",
    category: "Research",
    starters: [
      "Search this topic first, fetch the two most relevant sources, and compare them.",
      "Research this question across multiple sources and separate conclusions from evidence.",
      "Find current information and include source links.",
    ],
    lang: "en",
    createdAt: 1700000002002,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    tools: {
      toolServers: ["brave-search", "fetch"],
    },
    toolStrategy: {
      nativeToolBridge: "auto",
    },
    modelConfig: {
      responsesMode: "stateful",
      temperature: 0.25,
      max_tokens: 6000,
      historyMessageCount: 10,
    },
    context: [
      {
        id: "en-web-research-0",
        role: "system",
        content:
          "You are doing a web research task. For current information, public web materials, technical research, or product comparisons, prefer a web search tool to discover sources, then a fetch tool to read source pages. Do not treat search result pages as source documents. Start with the conclusion, then list key evidence, differences, uncertainty, and source links. If tools are unavailable, sources are insufficient, or fetching fails, say so directly and do not invent sources.",
        date: "",
      },
    ],
  }),
  createBuiltinSkill({
    avatar: "1f4c4",
    name: "Read and Summarize",
    description:
      "Read webpages, documents, or long text and extract summaries, structure, and actions.",
    category: "Reading",
    starters: [
      "Fetch this webpage and summarize it in Chinese.",
      "Read this long text and extract the summary, key conclusions, and action items.",
      "Turn this material into a structure suitable for a briefing.",
    ],
    lang: "en",
    createdAt: 1700000002003,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    context: [
      {
        id: "en-reading-0",
        role: "system",
        content:
          "You are doing a reading and summarization task. Preserve the source facts, structure, and key conclusions. Separate the source's claims from your own analysis. Default output: one-sentence summary, key points, important details, action items, and open questions. Do not add unsupported information. If the material is from the web, include source links when available.",
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
    name: "Compare Options",
    description:
      "Compare products, technical choices, or decisions using shared criteria.",
    category: "Analysis",
    starters: [
      "Compare these options with evaluation criteria, pros and cons, and a recommendation.",
      "Put these two products in a table by price, capabilities, limits, and fit.",
      "Define the decision criteria first, then tell me which option fits best.",
    ],
    lang: "en",
    createdAt: 1700000002004,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.research,
    },
    context: [
      {
        id: "en-compare-0",
        role: "system",
        content:
          "You are doing an option comparison task. First clarify the user's goal and evaluation criteria, then compare capabilities, cost, limits, risks, and fit. Default output: conclusion, comparison table, key tradeoffs, recommendation, and next validation steps. Label assumptions when facts are incomplete. For current information, prefer search and fetch tools to verify details.",
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
    name: "Deep Reasoning",
    description:
      "Enable deep reasoning for capable models. Best for complex analysis, planning, and difficult problems.",
    category: "Analysis",
    starters: [
      "Analyze this deeply: break down the variables first, then give the conclusion.",
      "Use deeper reasoning to solve this complex task.",
      "Run a structured analysis with assumptions, reasoning, risks, and next checks.",
    ],
    lang: "en",
    createdAt: 1700000002006,
    syncGlobalConfig: false,
    candidateModels: [{ capability: "reasoning" }],
    toolStrategy: {
      nativeToolBridge: "auto",
    },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.reasoning,
    },
    context: [
      {
        id: "en-deep-reasoning-0",
        role: "system",
        content:
          "You are doing a deep reasoning task. Identify the problem type and constraints first, then analyze it structurally. Separate facts, assumptions, reasoning, and conclusions. For complex problems, include tradeoffs, risks, and next validation steps. Do not make the answer long just to appear complex; keep the reasoning clear and the conclusion actionable.",
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
    name: "Image Creation",
    description:
      "Use a session tuned for visual ideas, prompting, and image-generation output.",
    category: "Creative",
    starters: [
      "Create a poster-style cover image and refine the prompt first.",
      "Turn this product idea into a strong prompt for an image model.",
      "Give me three visual directions first, then continue with the one I choose.",
    ],
    lang: "en",
    createdAt: 1700000002005,
    syncGlobalConfig: false,
    launch: { type: "sd" },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.image,
    },
    context: [
      {
        id: "en-image-0",
        role: "system",
        content:
          "You are an image creation assistant. Turn the user's goal into a clear, executable visual prompt, adding style, composition, lighting, materials, text elements, and negative constraints only when useful. Keep responses concise and optimize for the next image generation.",
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
  createBuiltinSkill({
    avatar: "1f3a7",
    name: "Realtime Chat",
    description:
      "Use realtime voice conversation for spoken interaction, quick feedback, and natural back-and-forth.",
    category: "Voice",
    starters: [
      "Start a realtime voice chat.",
      "I want to discuss this by voice.",
      "Open realtime conversation and talk with me.",
    ],
    lang: "en",
    createdAt: 1700000002007,
    syncGlobalConfig: false,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.realtime,
    },
    context: [
      {
        id: "en-realtime-0",
        role: "system",
        content:
          "You are in a realtime voice chat. Keep responses natural, concise, and suitable for spoken conversation. If the user pauses or speaks incompletely, confirm the intent and keep the conversation moving.",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.5,
      historyMessageCount: 6,
    },
    realtimeConfig: {
      enabled: false,
      provider: REALTIME_ROUTER_PROVIDER,
      model: DEFAULT_ROUTER_REALTIME_MODEL,
      voice: DEFAULT_ROUTER_REALTIME_VOICE,
    },
  }),
];
