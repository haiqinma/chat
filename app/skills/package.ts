import type { ModelCandidate } from "../client/api";
import type { Lang } from "../locales";
import type { ChatMessage } from "../store/chat";
import type { ModelConfig } from "../store/config";
import {
  createDefaultRealtimeConfig,
  type RealtimeConfig,
} from "../store/realtime";
import type {
  BuiltInSkillToolType,
  Skill,
  SkillSessionToolbarConfig,
} from "../store/skill";
import type { BuiltinSkill } from "./typing";

export type LocalizedText = string | Partial<Record<Lang, string>>;

export type SkillIcon =
  | { type: "emoji"; value: string }
  | { type: "builtin"; value: string }
  | { type: "url"; value: string };

export type SkillLaunch =
  | { type: "chat" }
  | { type: "workspace"; target: "chat" | "sd" | "settings" | string }
  | { type: "external"; url: string };

export type SkillInstructions =
  | { type: "inline"; content: string }
  | { type: "file"; path: string };

export type SkillPackageModel = {
  syncGlobalConfig?: boolean;
  default?: {
    provider?: ModelConfig["providerName"];
    model?: string;
  };
  candidates?: ModelCandidate[];
  params?: Partial<ModelConfig>;
};

export type SkillTool = {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  required: boolean;
};

export type SkillToolServer = {
  id: string;
  name: LocalizedText;
  transport: "stdio" | "http" | "sse";
  required: boolean;
  configSchema?: Record<string, unknown>;
};

export type SkillPermissions = {
  network: boolean;
  filesystem: boolean;
  wallet: boolean;
  externalTools: string[];
  dataScopes?: string[];
};

export type SkillVisibility = {
  scope: "private" | "organization" | "public";
  roles?: string[];
  users?: string[];
};

export type SkillRelease = {
  status: "draft" | "published" | "deprecated" | "removed";
  review?: "pending" | "approved" | "rejected";
  changelog?: string;
};

export type SkillPackage = {
  schemaVersion: string;
  id: string;
  version: string;
  name: LocalizedText;
  description?: LocalizedText;
  author?: {
    name: string;
    url?: string;
  };
  icon?: SkillIcon;
  tags?: string[];
  category?: string;
  visibility?: SkillVisibility;
  launch?: SkillLaunch;
  instructions?: SkillInstructions;
  starters?: string[];
  model?: SkillPackageModel;
  realtime?: Partial<RealtimeConfig>;
  tools?: SkillTool[];
  toolServers?: SkillToolServer[];
  ui?: {
    entryLabel?: LocalizedText;
    emptyState?: "minimal" | "guided";
    sessionToolbar?: SkillSessionToolbarConfig;
  };
  permissions?: SkillPermissions;
  compatibility?: {
    appVersion?: string;
    toolRuntime?: string;
  };
  release?: SkillRelease;
};

const BUILT_IN_TOOL_IDS = new Set<string>(["web_search"]);

function isBuiltInTool(id: string): id is BuiltInSkillToolType {
  return BUILT_IN_TOOL_IDS.has(id);
}

function getSkillBuiltInTools(skill: Skill | BuiltinSkill) {
  return skill.tools?.builtInTools ?? [];
}

function getSkillApiTools(skill: Skill | BuiltinSkill) {
  return skill.tools?.apiTools ?? skill.plugin ?? [];
}

function getSkillToolServers(skill: Skill | BuiltinSkill) {
  return skill.tools?.toolServers ?? [];
}

function getSkillToolServerRequired(skill: Skill | BuiltinSkill, id: string) {
  return skill.tools?.toolRequirements?.[id] !== false;
}

function syncSkillLegacyPlugin(skill: Skill) {
  const apiTools = skill.tools?.apiTools ?? skill.plugin ?? [];
  const toolServers = skill.tools?.toolServers ?? [];
  const existingToolRequirements = skill.tools?.toolRequirements ?? {};
  skill.plugin = apiTools;
  skill.tools = {
    builtInTools: skill.tools?.builtInTools ?? [],
    toolServers,
    toolRequirements: Object.fromEntries(
      toolServers.map((id) => [id, existingToolRequirements[id] ?? true]),
    ),
    apiTools,
  };
}

export function resolveLocalizedText(
  value: LocalizedText | undefined,
  lang: Lang,
  fallback = "",
) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value[lang] ?? value.cn ?? value.en ?? fallback;
}

function resolveSkillAvatar(icon?: SkillIcon) {
  if (!icon) return "gpt-bot";
  return icon.value;
}

function resolveSkillContext(skillPackage: SkillPackage): ChatMessage[] {
  if (skillPackage.instructions?.type !== "inline") return [];

  return [
    {
      id: `${skillPackage.id}-instructions`,
      role: "system",
      content: skillPackage.instructions.content,
      date: "",
    },
  ];
}

function resolveLegacyLaunch(
  launch?: SkillLaunch,
): Skill["launch"] | undefined {
  if (!launch) return undefined;
  if (launch.type === "chat") return { type: "chat" };
  if (launch.type === "workspace" && launch.target === "sd") {
    return { type: "sd" };
  }
  if (launch.type === "workspace" && launch.target === "chat") {
    return { type: "chat" };
  }
  return undefined;
}

export function skillPackageToSkill(
  skillPackage: SkillPackage,
  lang: Lang,
  baseModelConfig: ModelConfig,
): Skill {
  const ui = skillPackage.realtime
    ? {
        ...skillPackage.ui,
        sessionToolbar: {
          ...skillPackage.ui?.sessionToolbar,
          realtime: true,
        },
      }
    : skillPackage.ui;
  const packageTools = skillPackage.tools ?? [];
  const builtInTools = packageTools
    .map((tool) => tool.id)
    .filter(isBuiltInTool);
  const apiTools = packageTools
    .map((tool) => tool.id)
    .filter((id) => !isBuiltInTool(id));
  const toolServers = skillPackage.toolServers ?? [];
  const skill = {
    id: skillPackage.id,
    createdAt: Date.now(),
    avatar: resolveSkillAvatar(skillPackage.icon),
    name: resolveLocalizedText(skillPackage.name, lang, skillPackage.id),
    description: resolveLocalizedText(skillPackage.description, lang),
    category: skillPackage.category,
    starters: skillPackage.starters,
    hideContext: true,
    context: resolveSkillContext(skillPackage),
    syncGlobalConfig: skillPackage.model?.syncGlobalConfig ?? true,
    modelConfig: {
      ...baseModelConfig,
      ...skillPackage.model?.params,
      model: skillPackage.model?.default?.model ?? baseModelConfig.model,
      providerName:
        skillPackage.model?.default?.provider ?? baseModelConfig.providerName,
    },
    ...(skillPackage.realtime
      ? { realtimeConfig: createDefaultRealtimeConfig(skillPackage.realtime) }
      : {}),
    candidateModels: skillPackage.model?.candidates,
    lang,
    builtin: false,
    plugin: apiTools,
    tools: {
      builtInTools,
      toolServers: toolServers.map((server) => server.id),
      toolRequirements: Object.fromEntries(
        toolServers.map((server) => [server.id, server.required]),
      ),
      apiTools,
    },
    ui,
    launch: resolveLegacyLaunch(skillPackage.launch),
  };
  syncSkillLegacyPlugin(skill);
  return skill;
}

function resolvePackageLaunch(skill: Pick<Skill, "launch">): SkillLaunch {
  if (skill.launch?.type === "sd") {
    return { type: "workspace", target: "sd" };
  }
  return { type: "chat" };
}

function resolvePackageInstructions(
  skill: Pick<Skill | BuiltinSkill, "context">,
): SkillInstructions | undefined {
  const content = skill.context
    .filter((message) => message.role === "system" && message.content)
    .map((message) => message.content)
    .join("\n\n");

  if (!content) return undefined;
  return { type: "inline", content };
}

export function skillToSkillPackage(skill: Skill | BuiltinSkill): SkillPackage {
  const modelConfig = skill.modelConfig;
  const defaultModel =
    modelConfig.providerName || modelConfig.model
      ? {
          provider: modelConfig.providerName,
          model: modelConfig.model,
        }
      : undefined;

  return {
    schemaVersion: "1.0",
    id: "id" in skill ? skill.id : `builtin.${skill.lang}.${skill.createdAt}`,
    version: "1.0.0",
    name: {
      [skill.lang]: skill.name,
    },
    description: skill.description
      ? {
          [skill.lang]: skill.description,
        }
      : undefined,
    icon: {
      type: "emoji",
      value: skill.avatar,
    },
    category: skill.category,
    visibility: {
      scope: "public",
    },
    launch: resolvePackageLaunch(skill),
    instructions: resolvePackageInstructions(skill),
    starters: skill.starters,
    model: {
      syncGlobalConfig: skill.syncGlobalConfig,
      default: defaultModel,
      candidates: skill.candidateModels,
      params: modelConfig,
    },
    realtime: skill.realtimeConfig,
    tools: [
      ...getSkillBuiltInTools(skill as Skill).map((tool) => ({
        id: tool,
        name: tool,
        required: false,
      })),
      ...getSkillApiTools(skill as Skill).map((plugin) => ({
        id: plugin,
        name: plugin,
        required: false,
      })),
    ],
    toolServers: getSkillToolServers(skill as Skill).map((id) => ({
      id,
      name: id,
      transport: "stdio",
      required: getSkillToolServerRequired(skill as Skill, id),
    })),
    ui: skill.ui,
    permissions: {
      network: false,
      filesystem: false,
      wallet: false,
      externalTools: [
        ...getSkillApiTools(skill as Skill),
        ...getSkillBuiltInTools(skill as Skill),
        ...getSkillToolServers(skill as Skill),
      ],
    },
    compatibility: {
      appVersion: ">=0.1.0",
    },
    release: {
      status: "published",
      review: "approved",
    },
  };
}
