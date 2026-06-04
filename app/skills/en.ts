import { BuiltinSkill } from "./typing";
import { createBuiltinSkill } from "./utils";
import { ServiceProvider } from "../constant";

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
    context: [
      {
        id: "en-web-research-0",
        role: "system",
        content:
          "You are doing a web research task. For current information, public web materials, technical research, or product comparisons, prefer a web search tool to discover sources, then a fetch tool to read source pages. Do not treat search result pages as source documents. Start with the conclusion, then list key evidence, differences, uncertainty, and source links. If tools are unavailable, sources are insufficient, or fetching fails, say so directly and do not invent sources.",
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
    context: [
      {
        id: "en-image-0",
        role: "system",
        content:
          "You are doing an image creation task. First understand the subject, style, composition, lighting, materials, text elements, and intended use, then produce output that works well for image-generation models. By default, provide a refined prompt, style directions, negative constraints, and size or quality suggestions. If the current model supports image generation, generate the image directly. If it does not, say so clearly and help the user refine the prompt first.",
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
