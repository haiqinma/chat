import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

import { getClientConfig } from "../config/client";
import { Path } from "../constant";
import Locale, { getLang, type Lang } from "../locales";
import {
  addToolServer,
  getClientsStatus,
  getToolConfigFromFile,
} from "../tools/actions";
import {
  fetchCommunityToolPresetServers,
  mergeToolPresetServers,
} from "../tools/marketplace";
import { fetchMarketplaceJson } from "../marketplace/sources";
import {
  getMarketplaceCategoryLabel,
  getMarketplaceTagLabel,
} from "../marketplace/display";
import {
  getMissingToolConfigKeys,
  readToolConfigBoolean,
  stringifyToolConfigValue,
} from "../tools/config-schema";
import { getOfficialToolPresetServers } from "../tools/preset-servers";
import {
  ToolConfigData,
  PresetServer,
  ServerStatusResponse,
} from "../tools/types";
import {
  resolveLocalizedText,
  type SkillPackage,
  skillPackageToSkill,
} from "../skills";
import { useAppConfig, useChatStore } from "../store";
import {
  getStoredUserSkills,
  Skill,
  getBuiltinSkillPackageId,
  getSkillApiTools,
  getSkillBuiltInTools,
  getSkillToolServers,
  isBuiltinSkillOverride,
  mergeVisibleSkills,
  useSkillStore,
} from "../store/skill";
import { usePluginStore } from "../store/plugin";
import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import { List, ListItem, Modal, showToast } from "./ui-lib";
import { SkillConfig } from "./skill-editor";
import AddIcon from "../icons/add.svg";
import BrainIcon from "../icons/brain.svg";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import EditIcon from "../icons/edit.svg";
import EyeIcon from "../icons/eye.svg";
import ModelServiceIcon from "../icons/llm-icons/default.svg";
import CloudStorageIcon from "../icons/cloud-success.svg";
import ToolIcon from "../icons/tool.svg";
import styles from "./discovery.module.scss";
import { useAccessStore } from "../store/access";
import { useSdStore } from "../store/sd";
import { useSyncStore } from "../store/sync";
import { fetchQuota, WebDAVQuota } from "../plugins/webdav";
import { formatBytes } from "../utils/format";
import { resolveImageModels } from "./sd/image-registry";
import {
  getSkillRuntimeIssueSummary,
  getSkillRuntimeStatusOrder,
  resolveSkillRuntimeStatus,
  SkillRuntimeResult,
  SkillRuntimeStatus,
} from "../skills/runtime";

type CapabilityType = "all" | "skill" | "tool" | "provider" | "storage";
type PricingType = "free" | "subscription" | "usage";
type RuntimeType = "cloud" | "local" | "both";
type DiscoveryView = "market" | "mine";
type SkillPackageList = Partial<Record<Lang, SkillPackage[]>>;
type DiscoveryConfigProperty = {
  type: string;
  description?: string;
  required?: boolean;
  minItems?: number;
  itemLabel?: string;
  addButtonText?: string;
  helpUrl?: string;
  helpLabel?: string;
};

type Capability = {
  id: string;
  type: Exclude<CapabilityType, "all">;
  title: string;
  description: string;
  highlights: string[];
  status: string;
  pricing: PricingType;
  runtime: RuntimeType;
  source: string;
  path: Path;
  installed: boolean;
  skill?: Skill;
  skillPackage?: SkillPackage;
  skillPackageLang?: Lang;
  runtimeStatus?: SkillRuntimeStatus;
  runtimeResult?: SkillRuntimeResult;
  presetServer?: PresetServer;
};

const isApp = !!getClientConfig()?.isApp;
const skillRuntime: RuntimeType = isApp ? "local" : "cloud";
const toolRuntime: RuntimeType = isApp ? "local" : "cloud";

const typeOrder: CapabilityType[] = [
  "all",
  "skill",
  "tool",
  "provider",
  "storage",
];

const OFFICIAL_MARKETPLACE_SKILL_PACKAGE_IDS = new Set([
  "web-research",
  "reading-summary",
]);
const HIDDEN_DISCOVERY_TOOL_SERVER_IDS = new Set(["everything"]);

function getInitialType(search: string): CapabilityType {
  const type = new URLSearchParams(search).get("type");
  if (type === "model") return "provider";
  if (type === "tool") return "tool";
  if (
    type === "skill" ||
    type === "tool" ||
    type === "provider" ||
    type === "storage"
  ) {
    return type;
  }
  return "all";
}

function getInitialView(search: string): DiscoveryView {
  return new URLSearchParams(search).get("view") === "mine" ? "mine" : "market";
}

function getDiscoveryPath(view: DiscoveryView, type: CapabilityType) {
  const params = new URLSearchParams();
  if (view === "mine") params.set("view", view);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return query ? `${Path.Discovery}?${query}` : Path.Discovery;
}

function getSkillPackageId(skill: Skill) {
  return skill.packageId || getBuiltinSkillPackageId(skill);
}

function getCapabilityIcon(type: Capability["type"]) {
  if (type === "skill") return <BrainIcon />;
  if (type === "tool") return <ToolIcon />;
  if (type === "storage") return <CloudStorageIcon />;
  return <ModelServiceIcon />;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isSensitiveToolConfigField(
  key: string,
  prop: DiscoveryConfigProperty,
) {
  const text = `${key} ${prop.description ?? ""}`.toLowerCase();
  return (
    text.includes("key") ||
    text.includes("secret") ||
    text.includes("token") ||
    text.includes("password")
  );
}

function isOfficialMarketplaceSkillPackage(skillPackage: SkillPackage) {
  return OFFICIAL_MARKETPLACE_SKILL_PACKAGE_IDS.has(skillPackage.id);
}

export function DiscoveryPage() {
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const skillStore = useSkillStore();
  const sdStore = useSdStore();
  const storageConfigured = useSyncStore((state) => state.cloudSync());
  const storageProvider = useSyncStore((state) => state.provider);
  const storageWebdav = useSyncStore((state) => state.webdav);
  const location = useLocation();
  const view = getInitialView(location.search);
  const activeType = getInitialType(location.search);
  const currentLang = getLang();
  const officialToolPresetServers = useMemo(
    () => getOfficialToolPresetServers(currentLang),
    [currentLang],
  );
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const skillRecords = useSkillStore((state) => state.skills);
  const builtinOverrideRecords = useSkillStore(
    (state) => state.builtinOverrides,
  );
  const pluginRecords = usePluginStore((state) => state.plugins);
  const models = useAppConfig((state) => state.models);
  const hideBuiltinSkills = useAppConfig((state) => state.hideBuiltinSkills);
  const modelConfig = useAppConfig((state) => state.modelConfig);
  const customModels = useAppConfig((state) => state.customModels);
  const accessCustomModels = useAccessStore((state) => state.customModels);
  const defaultModel = useAccessStore((state) => state.defaultModel);
  const [toolConfig, setToolConfig] = useState<ToolConfigData>();
  const [toolStatuses, setToolStatuses] = useState<
    Record<string, ServerStatusResponse> | undefined
  >();
  const [communitySkillPackages, setCommunitySkillPackages] =
    useState<SkillPackageList>({});
  const [communityToolServers, setCommunityToolServers] = useState<
    PresetServer[]
  >([]);
  const [editingToolServerId, setEditingToolServerId] = useState<string>();
  const [viewingToolCapability, setViewingToolCapability] =
    useState<Capability>();
  const [editingSkillId, setEditingSkillId] = useState<string>();
  const [toolUserConfig, setToolUserConfig] = useState<Record<string, any>>({});
  const [savingToolConfig, setSavingToolConfig] = useState(false);
  const [storageQuota, setStorageQuota] = useState<WebDAVQuota>();
  const [storageQuotaStatus, setStorageQuotaStatus] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    const loadToolState = async () => {
      try {
        const [config, statuses] = await Promise.all([
          getToolConfigFromFile(),
          getClientsStatus(),
        ]);
        if (cancelled) return;
        setToolConfig(config);
        setToolStatuses(statuses);
      } catch (error) {
        console.warn("[Discovery] failed to load tool state", error);
      }
    };
    loadToolState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchCommunityToolPresetServers(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCommunityToolServers(result.data);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCommunityToolServers([]);
          console.warn(
            "[Discovery] failed to load community tool package list",
            error,
          );
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!storageConfigured) {
      setStorageQuota(undefined);
      setStorageQuotaStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    setStorageQuotaStatus("checking");
    fetchQuota()
      .then((quota) => {
        if (cancelled) return;
        setStorageQuota(quota);
        setStorageQuotaStatus(quota ? "ready" : "error");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[Discovery] failed to load storage quota", error);
        setStorageQuota(undefined);
        setStorageQuotaStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    storageConfigured,
    storageProvider,
    storageWebdav.authType,
    storageWebdav.baseUrl,
    storageWebdav.prefix,
    storageWebdav.username,
    storageWebdav.password,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    fetchMarketplaceJson<SkillPackageList>("skill", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCommunitySkillPackages(result.data);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCommunitySkillPackages({});
          console.warn(
            "[Discovery] failed to load community skill package list",
            error,
          );
        }
      });

    return () => controller.abort();
  }, [currentLang]);

  const skills = useMemo<Skill[]>(() => {
    return mergeVisibleSkills({
      userSkills: getStoredUserSkills({
        skills: skillRecords,
        builtinOverrides: builtinOverrideRecords,
      }),
      hideBuiltinSkills,
      lang: currentLang,
      modelConfig,
    });
  }, [
    builtinOverrideRecords,
    currentLang,
    hideBuiltinSkills,
    modelConfig,
    skillRecords,
  ]);
  const editingSkill = useMemo(
    () => skills.find((skill) => String(skill.id) === editingSkillId),
    [editingSkillId, skills],
  );
  const plugins = useMemo(
    () =>
      Object.values(pluginRecords).sort((a, b) => b.createdAt - a.createdAt),
    [pluginRecords],
  );

  const capabilities = useMemo<Capability[]>(() => {
    const installedPluginIds = plugins.map((plugin) => plugin.id);
    const installedToolServerIds = Object.keys(toolConfig?.toolServers ?? {});
    const availableImageModels = resolveImageModels(
      models.filter((model) => model.available),
      "generation",
    );
    const toolPresetServers = mergeToolPresetServers(
      officialToolPresetServers,
      communityToolServers,
    );
    const installedPackageIds = new Set(
      getStoredUserSkills({
        skills: skillRecords,
        builtinOverrides: builtinOverrideRecords,
      })
        .map((skill) => skill.packageId)
        .filter(Boolean),
    );
    const skillItems = skills
      .map((skill) => {
        const runtimeSkill = skill as Skill;
        const skillToolCount =
          getSkillBuiltInTools(runtimeSkill).length +
          getSkillToolServers(runtimeSkill).length +
          getSkillApiTools(runtimeSkill).length;
        const runtime = resolveSkillRuntimeStatus({
          skill: runtimeSkill,
          models,
          customModels,
          accessCustomModels,
          defaultModel,
          globalModelConfig: modelConfig,
          installedPluginIds,
          installedToolServerIds,
          toolStatuses,
        });
        const isImageSkill = skill.launch?.type === "sd";
        const effectiveRuntime: SkillRuntimeResult =
          isImageSkill && availableImageModels.length === 0
            ? {
                status: "unavailable",
                issues: [
                  {
                    type: "model",
                    message: Locale.Discovery.NoImageModels,
                  },
                ],
              }
            : runtime;
        const runtimeSummary = getSkillRuntimeIssueSummary(runtime);
        return {
          id: `skill:${skill.id}`,
          type: "skill" as const,
          title: skill.name,
          description: skill.description || Locale.Discovery.DefaultSkillDesc,
          highlights: [
            getMarketplaceCategoryLabel(skill.category, currentLang),
            skill.starters?.length
              ? Locale.Discovery.SkillStarters(skill.starters.length)
              : undefined,
            skillToolCount
              ? Locale.Discovery.SkillTools(skillToolCount)
              : undefined,
            getSkillRuntimeIssueSummary(effectiveRuntime) ||
              runtimeSummary ||
              undefined,
          ].filter(Boolean) as string[],
          status:
            effectiveRuntime.status === "ready"
              ? Locale.Discovery.Status.Available
              : effectiveRuntime.status === "unavailable"
                ? Locale.Discovery.Status.Unavailable
                : Locale.Discovery.Status.Configurable,
          pricing: "free" as const,
          runtime: skillRuntime,
          source:
            skill.builtin || isBuiltinSkillOverride(skill)
              ? Locale.Discovery.Source.Official
              : Locale.Discovery.Source.Custom,
          path: Path.Skills,
          installed: true,
          skill: runtimeSkill,
          runtimeStatus: effectiveRuntime.status,
          runtimeResult: effectiveRuntime,
        };
      })
      .sort((a, b) => {
        const statusDiff =
          getSkillRuntimeStatusOrder(a.runtimeStatus ?? "unavailable") -
          getSkillRuntimeStatusOrder(b.runtimeStatus ?? "unavailable");
        if (statusDiff !== 0) return statusDiff;
        return a.title.localeCompare(b.title);
      });

    const communitySkillItems = (communitySkillPackages[currentLang] ?? [])
      .filter((skillPackage) => !installedPackageIds.has(skillPackage.id))
      .map((skillPackage) => {
        const skill = skillPackageToSkill(
          skillPackage,
          currentLang,
          modelConfig,
        );
        skill.packageId = skillPackage.id;

        const skillToolCount =
          getSkillBuiltInTools(skill).length +
          getSkillToolServers(skill).length +
          getSkillApiTools(skill).length;
        const runtime = resolveSkillRuntimeStatus({
          skill,
          models,
          customModels,
          accessCustomModels,
          defaultModel,
          globalModelConfig: modelConfig,
          installedPluginIds,
          installedToolServerIds,
          toolStatuses,
        });
        const runtimeSummary = getSkillRuntimeIssueSummary(runtime);

        return {
          id: `community-skill:${currentLang}:${skillPackage.id}`,
          type: "skill" as const,
          title: resolveLocalizedText(
            skillPackage.name,
            currentLang,
            skillPackage.id,
          ),
          description: resolveLocalizedText(
            skillPackage.description,
            currentLang,
            Locale.Discovery.DefaultSkillDesc,
          ),
          highlights: [
            getMarketplaceCategoryLabel(skillPackage.category, currentLang),
            skillPackage.starters?.length
              ? Locale.Discovery.SkillStarters(skillPackage.starters.length)
              : undefined,
            skillToolCount
              ? Locale.Discovery.SkillTools(skillToolCount)
              : undefined,
            runtimeSummary || undefined,
          ].filter(Boolean) as string[],
          status:
            runtime.status === "ready"
              ? Locale.Discovery.Status.Available
              : runtime.status === "needs_config"
                ? Locale.Discovery.Status.Configurable
                : Locale.Discovery.Status.Unavailable,
          pricing: "free" as const,
          runtime: skillRuntime,
          source: isOfficialMarketplaceSkillPackage(skillPackage)
            ? Locale.Discovery.Source.Official
            : Locale.Discovery.Source.Community,
          path: Path.Skills,
          installed: false,
          skillPackage,
          skillPackageLang: currentLang,
          runtimeStatus: runtime.status,
          runtimeResult: runtime,
        };
      })
      .sort((a, b) => {
        const statusDiff =
          getSkillRuntimeStatusOrder(a.runtimeStatus ?? "unavailable") -
          getSkillRuntimeStatusOrder(b.runtimeStatus ?? "unavailable");
        if (statusDiff !== 0) return statusDiff;
        return a.title.localeCompare(b.title);
      });

    const officialToolIds = new Set(
      officialToolPresetServers.map((server) => server.id),
    );
    const toolItems: Capability[] = toolPresetServers
      .filter((server) => !HIDDEN_DISCOVERY_TOOL_SERVER_IDS.has(server.id))
      .map((server) => {
        const serverConfig = toolConfig?.toolServers[server.id];
        const serverStatus = toolStatuses?.[server.id]?.status;
        const installed = Boolean(serverConfig);
        const status =
          serverStatus === "active"
            ? Locale.Discovery.Status.Enabled
            : serverStatus === "error"
              ? Locale.Discovery.Status.Error
              : serverStatus === "paused"
                ? Locale.Discovery.Status.Paused
                : installed
                  ? Locale.Discovery.Status.Installed
                  : Locale.Discovery.Status.Configurable;

        return {
          id: `tool:${server.id}`,
          type: "tool",
          title: server.name,
          description: server.description,
          highlights: server.tags
            .slice(0, 3)
            .map((tag) => getMarketplaceTagLabel(tag, currentLang)),
          status,
          pricing: "free",
          runtime: toolRuntime,
          source: officialToolIds.has(server.id)
            ? Locale.Discovery.Source.Official
            : Locale.Discovery.Source.Community,
          path: Path.ToolMarket,
          installed,
          presetServer: server,
        };
      });

    const toolCapabilityItems: Capability[] = [...toolItems];

    const providerItems: Capability[] = [
      {
        id: "provider:router",
        type: "provider",
        title: Locale.Discovery.RouterProviderTitle,
        description: Locale.Discovery.RouterProviderDesc,
        highlights: ["router"],
        status: Locale.Discovery.Status.Enabled,
        pricing: "usage",
        runtime: "cloud",
        source: Locale.Discovery.Source.Official,
        path: Path.Router,
        installed: true,
      },
    ];

    const storageQuotaText = storageQuota
      ? storageQuota.unlimited
        ? Locale.Discovery.StorageQuotaUnlimited(formatBytes(storageQuota.used))
        : Locale.Discovery.StorageQuotaUsage(
            formatBytes(storageQuota.used),
            formatBytes(storageQuota.quota),
          )
      : undefined;
    const storageItems: Capability[] = [
      {
        id: "storage:cloud",
        type: "storage",
        title: Locale.Discovery.CloudStorageTitle,
        description: Locale.Discovery.CloudStorageDesc,
        highlights: [Locale.Discovery.StorageAppSync, storageQuotaText].filter(
          Boolean,
        ) as string[],
        status: !storageConfigured
          ? Locale.Discovery.Status.Configurable
          : storageQuotaStatus === "error"
            ? Locale.Discovery.Status.Error
            : Locale.Discovery.Status.Enabled,
        pricing: "free",
        runtime: "cloud",
        source: Locale.Discovery.Source.Official,
        path: Path.Storage,
        installed: storageConfigured,
      },
    ];

    return [
      ...skillItems,
      ...communitySkillItems,
      ...toolCapabilityItems,
      ...providerItems,
      ...storageItems,
    ];
  }, [
    accessCustomModels,
    communityToolServers,
    communitySkillPackages,
    currentLang,
    customModels,
    defaultModel,
    toolConfig?.toolServers,
    toolStatuses,
    modelConfig,
    models,
    officialToolPresetServers,
    plugins,
    builtinOverrideRecords,
    skillRecords,
    skills,
    storageConfigured,
    storageQuota,
    storageQuotaStatus,
  ]);

  const marketplaceSkillTitles = useMemo(
    () =>
      new Set(
        (communitySkillPackages[currentLang] ?? []).map((skillPackage) =>
          resolveLocalizedText(skillPackage.name, currentLang, skillPackage.id),
        ),
      ),
    [communitySkillPackages, currentLang],
  );

  const visibleCapabilities = capabilities.filter((item) => {
    const keyword = deferredSearchText.trim().toLowerCase();
    const matchType = activeType === "all" || item.type === activeType;
    const matchView = view === "market" || item.installed;
    const hideInstalledMarketplaceShadow =
      view === "market" &&
      item.type === "skill" &&
      item.installed &&
      !!item.skill &&
      !item.skill.builtin &&
      !isBuiltinSkillOverride(item.skill) &&
      marketplaceSkillTitles.has(item.title);
    const matchSearch =
      !keyword ||
      [
        item.title,
        item.description,
        item.source,
        item.status,
        ...item.highlights,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    return (
      matchType && matchView && !hideInstalledMarketplaceShadow && matchSearch
    );
  });

  const startSkill = (skill: Skill) => {
    if (skill.launch?.type === "sd") {
      sdStore.startBlankCreation();
      navigate(Path.Sd);
      return;
    }

    if (chatStore.newSession(skill) !== false) {
      navigate(Path.Chat);
    }
  };

  const ensureSkillConfigRecord = (skill: Skill) => {
    const packageId = getSkillPackageId(skill);
    const existingSkill = getStoredUserSkills(useSkillStore.getState()).find(
      (item) =>
        item.packageId === packageId ||
        (!item.builtin &&
          item.lang === skill.lang &&
          item.createdAt === skill.createdAt &&
          item.name === skill.name),
    );

    return (
      existingSkill ??
      useSkillStore.getState().create({
        ...skill,
        packageId,
      })
    );
  };

  const openSkillConfig = (skill: Skill) => {
    const editableSkill = skill.builtin
      ? ensureSkillConfigRecord(skill)
      : skill;
    setEditingSkillId(String(editableSkill.id));
  };

  const getConfigurableSkill = (item: Capability) => {
    if (item.type !== "skill") return undefined;
    if (item.skill) return item.skill;
    if (!item.skillPackage || !item.skillPackageLang) return undefined;

    const skill = skillPackageToSkill(
      item.skillPackage,
      item.skillPackageLang,
      modelConfig,
    );
    skill.packageId = item.skillPackage.id;
    return ensureSkillConfigRecord(skill);
  };

  useEffect(() => {
    if (!editingToolServerId) return;
    const preset = communityToolServers
      .concat(officialToolPresetServers)
      .find((server) => server.id === editingToolServerId);
    if (!preset?.configSchema) return;

    const currentConfig = toolConfig?.toolServers?.[editingToolServerId];
    if (!currentConfig) {
      setToolUserConfig({});
      return;
    }

    const nextUserConfig: Record<string, any> = {};
    Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
      if (mapping.type === "spread") {
        const startPos = mapping.position ?? 0;
        nextUserConfig[key] = currentConfig.args.slice(startPos);
      } else if (mapping.type === "single") {
        nextUserConfig[key] = currentConfig.args[mapping.position ?? 0];
      } else if (mapping.type === "env" && mapping.key && currentConfig.env) {
        nextUserConfig[key] = currentConfig.env[mapping.key];
      }
    });
    setToolUserConfig(nextUserConfig);
  }, [
    communityToolServers,
    editingToolServerId,
    toolConfig?.toolServers,
    officialToolPresetServers,
  ]);

  const renderToolPropertyDescription = (prop: DiscoveryConfigProperty) => {
    if (!prop.description && !prop.helpUrl) return undefined;
    return (
      <>
        {prop.description}
        {prop.helpUrl && (
          <>
            {prop.description ? " " : ""}
            <a href={prop.helpUrl} target="_blank" rel="noopener noreferrer">
              {prop.helpLabel || "Open Link"}
            </a>
          </>
        )}
      </>
    );
  };

  const renderToolConfigForm = () => {
    const preset = mergeToolPresetServers(
      officialToolPresetServers,
      communityToolServers,
    ).find((server) => server.id === editingToolServerId);
    if (!preset?.configSchema) return null;

    return Object.entries(preset.configSchema.properties).map(
      ([key, prop]: [string, DiscoveryConfigProperty]) => {
        if (prop.type === "array") {
          const currentValue = toolUserConfig[key] || [];
          const itemLabel = prop.itemLabel || key;
          const addButtonText = prop.addButtonText || `Add ${itemLabel}`;
          return (
            <ListItem
              key={key}
              title={key}
              subTitle={renderToolPropertyDescription(prop)}
              vertical
            >
              <div className={styles["config-list"]}>
                {(currentValue as string[]).map(
                  (value: string, index: number) => (
                    <div
                      key={`${key}-${index}`}
                      className={styles["config-item"]}
                    >
                      <input
                        type="text"
                        value={value}
                        placeholder={`${itemLabel} ${index + 1}`}
                        onChange={(e) => {
                          const nextValue = [...currentValue] as string[];
                          nextValue[index] = e.currentTarget.value;
                          setToolUserConfig({
                            ...toolUserConfig,
                            [key]: nextValue,
                          });
                        }}
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        className={styles["config-delete"]}
                        onClick={() => {
                          const nextValue = [...currentValue] as string[];
                          nextValue.splice(index, 1);
                          setToolUserConfig({
                            ...toolUserConfig,
                            [key]: nextValue,
                          });
                        }}
                      />
                    </div>
                  ),
                )}
                <IconButton
                  icon={<AddIcon />}
                  text={addButtonText}
                  bordered
                  onClick={() => {
                    const nextValue = [...currentValue, ""] as string[];
                    setToolUserConfig({ ...toolUserConfig, [key]: nextValue });
                  }}
                />
              </div>
            </ListItem>
          );
        }

        if (prop.type === "boolean") {
          const currentValue = readToolConfigBoolean(toolUserConfig[key]);
          return (
            <ListItem
              key={key}
              title={key}
              subTitle={renderToolPropertyDescription(prop)}
            >
              <input
                aria-label={key}
                type="checkbox"
                checked={currentValue}
                onChange={(e) =>
                  setToolUserConfig({
                    ...toolUserConfig,
                    [key]: e.currentTarget.checked,
                  })
                }
              />
            </ListItem>
          );
        }

        const currentValue = toolUserConfig[key] || "";
        return (
          <ListItem
            key={key}
            title={key}
            subTitle={renderToolPropertyDescription(prop)}
          >
            <input
              aria-label={key}
              type={isSensitiveToolConfigField(key, prop) ? "password" : "text"}
              autoComplete="off"
              value={currentValue}
              placeholder={`Enter ${key}`}
              onChange={(e) =>
                setToolUserConfig({
                  ...toolUserConfig,
                  [key]: e.currentTarget.value,
                })
              }
            />
          </ListItem>
        );
      },
    );
  };

  const saveToolServerConfig = async () => {
    const preset = mergeToolPresetServers(
      officialToolPresetServers,
      communityToolServers,
    ).find((server) => server.id === editingToolServerId);
    if (!preset || !preset.configSchema || !editingToolServerId) return;

    try {
      setSavingToolConfig(true);
      const missingKeys = getMissingToolConfigKeys(
        preset.configSchema.properties,
        toolUserConfig,
      );
      if (missingKeys.length > 0) {
        showToast(`缺少必填工具配置：${missingKeys.join(", ")}`);
        return;
      }

      const args = [...preset.baseArgs];
      const env: Record<string, string> = {};

      Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
        const value = toolUserConfig[key];
        if (mapping.type === "spread" && Array.isArray(value)) {
          const pos = mapping.position ?? 0;
          args.splice(pos, 0, ...value.filter(Boolean));
        } else if (
          mapping.type === "single" &&
          mapping.position !== undefined &&
          typeof value === "string"
        ) {
          args[mapping.position] = value;
        } else if (mapping.type === "env" && mapping.key) {
          const envValue = stringifyToolConfigValue(value);
          if (envValue !== undefined) {
            env[mapping.key] = envValue;
          }
        }
      });

      const serverConfig = {
        command: preset.command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
      const newConfig = await addToolServer(editingToolServerId, serverConfig);
      const statuses = await getClientsStatus();
      setToolConfig(newConfig);
      setToolStatuses(statuses);
      setEditingToolServerId(undefined);
      setToolUserConfig({});
      showToast(Locale.Discovery.Status.Enabled);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save tool config",
      );
    } finally {
      setSavingToolConfig(false);
    }
  };

  const handleCapabilityAction = (item: Capability) => {
    if (item.type === "tool" && item.presetServer) {
      if (item.installed) {
        setViewingToolCapability(item);
        return;
      }

      if (item.presetServer.configurable) {
        setEditingToolServerId(item.presetServer.id);
        setToolUserConfig({});
        return;
      }

      const enableTool = async () => {
        try {
          const serverConfig = {
            command: item.presetServer!.command,
            args: [...item.presetServer!.baseArgs],
          };
          const newConfig = await addToolServer(
            item.presetServer!.id,
            serverConfig,
          );
          const statuses = await getClientsStatus();
          setToolConfig(newConfig);
          setToolStatuses(statuses);
          setViewingToolCapability({
            ...item,
            installed: true,
            status: Locale.Discovery.Status.Installed,
          });
          showToast(Locale.Discovery.Status.Enabled);
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : "Failed to enable tool",
          );
        }
      };

      void enableTool();
      return;
    }

    if (item.type === "skill" && item.skillPackage && item.skillPackageLang) {
      const skill = skillPackageToSkill(
        item.skillPackage,
        item.skillPackageLang,
        modelConfig,
      );
      skill.packageId = item.skillPackage.id;

      if (item.runtimeStatus === "ready") {
        startSkill(skill);
      } else {
        openSkillConfig(ensureSkillConfigRecord(skill));
      }
      return;
    }

    if (item.type === "skill" && item.skill) {
      if (item.runtimeStatus !== "ready") {
        openSkillConfig(item.skill);
        return;
      }
      startSkill(item.skill);
      return;
    }
    if (item.type === "storage") {
      navigate(Path.Storage);
      return;
    }
    navigate(item.path);
  };

  const getActionText = (item: Capability) => {
    if (item.type === "skill") {
      return item.runtimeStatus === "ready"
        ? Locale.Discovery.Use
        : Locale.Discovery.ConfigureAndEnable;
    }
    if (item.type === "tool") {
      if (!item.installed && item.presetServer?.configurable) {
        return Locale.Discovery.ConfigureAndEnable;
      }
      if (view === "market" && !item.installed) return Locale.Discovery.Enable;
      return Locale.Discovery.Manage;
    }
    if (item.type === "storage") {
      return item.installed
        ? Locale.Discovery.Manage
        : Locale.Discovery.Configure;
    }
    if (view === "market" && !item.installed) return Locale.Discovery.Enable;
    return Locale.Discovery.Manage;
  };

  return (
    <ErrorBoundary>
      <div className={styles["discovery-page"]}>
        <div className="window-header">
          <div className="window-header-title">
            <div className="window-header-main-title">
              {Locale.Discovery.Page.Title}
            </div>
            <div className="window-header-submai-title">
              {Locale.Discovery.Page.SubTitle}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                text={
                  view === "market"
                    ? Locale.Discovery.MyCapabilities
                    : Locale.Discovery.BackToMarket
                }
                bordered
                onClick={() =>
                  navigate(
                    getDiscoveryPath(
                      view === "market" ? "mine" : "market",
                      activeType,
                    ),
                  )
                }
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
              />
            </div>
          </div>
        </div>

        <div className={styles["discovery-body"]}>
          <div className={styles.toolbar}>
            <input
              className={styles.search}
              value={searchText}
              placeholder={
                view === "market"
                  ? Locale.Discovery.SearchMarket
                  : Locale.Discovery.SearchMine
              }
              onChange={(event) => setSearchText(event.currentTarget.value)}
            />
            <div className={styles.filters}>
              {typeOrder.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={clsx(
                    styles.filter,
                    activeType === type && styles["filter-active"],
                  )}
                  onClick={() => navigate(getDiscoveryPath(view, type))}
                >
                  {Locale.Discovery.Types[type]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.grid}>
            {visibleCapabilities.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  styles.card,
                  item.type === "tool" && styles["card-clickable"],
                )}
                role={item.type === "tool" ? "button" : undefined}
                tabIndex={item.type === "tool" ? 0 : undefined}
                onClick={() => {
                  if (item.type === "tool") {
                    setViewingToolCapability(item);
                  }
                }}
                onKeyDown={(event) => {
                  if (item.type !== "tool") return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setViewingToolCapability(item);
                }}
              >
                <div className={styles["card-header"]}>
                  <div className={styles["card-title"]}>
                    <span className={styles["type-icon"]} aria-hidden>
                      {getCapabilityIcon(item.type)}
                    </span>
                    <span>{item.title}</span>
                  </div>
                  <span className={styles.badge}>{item.status}</span>
                </div>
                <div className={styles["card-desc"]}>{item.description}</div>
                <div className={styles.badges}>
                  {item.type === "tool" && (
                    <span className={styles.badge}>
                      {Locale.Discovery.ToolUserProvided}
                    </span>
                  )}
                  <span className={styles.badge}>
                    {Locale.Discovery.Runtime[item.runtime]}
                  </span>
                  <span
                    className={clsx(
                      styles.badge,
                      item.pricing !== "free" && styles["badge-paid"],
                    )}
                  >
                    {Locale.Discovery.Pricing[item.pricing]}
                  </span>
                </div>
                <div className={styles.meta}>
                  <span>
                    {Locale.Discovery.SourceLabel}: {item.source}
                  </span>
                </div>
                <div className={styles.actions}>
                  <IconButton
                    icon={<EyeIcon />}
                    text={getActionText(item)}
                    bordered
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCapabilityAction(item);
                    }}
                  />
                  {item.type === "skill" && item.runtimeStatus === "ready" && (
                    <IconButton
                      icon={<EditIcon />}
                      text={Locale.Discovery.Configure}
                      bordered
                      onClick={(event) => {
                        event.stopPropagation();
                        const skill = getConfigurableSkill(item);
                        if (!skill) return;
                        openSkillConfig(skill);
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            {visibleCapabilities.length === 0 && (
              <div className={styles.empty}>
                <div>{Locale.Discovery.Empty}</div>
                {(searchText || activeType !== "all") && (
                  <button
                    type="button"
                    className={styles["empty-action"]}
                    onClick={() => {
                      setSearchText("");
                      navigate(getDiscoveryPath(view, "all"));
                    }}
                  >
                    {Locale.Discovery.ResetFilters}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {editingToolServerId && (
          <div className="modal-mask">
            <Modal
              title={`Configure Tool - ${editingToolServerId}`}
              onClose={() =>
                !savingToolConfig && setEditingToolServerId(undefined)
              }
              actions={[
                <IconButton
                  key="cancel"
                  text="Cancel"
                  bordered
                  disabled={savingToolConfig}
                  onClick={() => {
                    setEditingToolServerId(undefined);
                    setToolUserConfig({});
                  }}
                />,
                <IconButton
                  key="save"
                  text="Save"
                  type="primary"
                  bordered
                  disabled={savingToolConfig}
                  onClick={saveToolServerConfig}
                />,
              ]}
            >
              <div className={styles["tool-config-hint"]}>
                {Locale.Discovery.ToolUserConfigHint}
              </div>
              <List>{renderToolConfigForm()}</List>
            </Modal>
          </div>
        )}
        {editingSkill && (
          <div className="modal-mask">
            <Modal
              title={Locale.Skill.EditModal.Title(editingSkill.builtin)}
              onClose={() => setEditingSkillId(undefined)}
            >
              <SkillConfig
                skill={editingSkill}
                updateSkill={(updater) =>
                  skillStore.updateSkill(editingSkill.id, updater)
                }
                readonly={editingSkill.builtin}
              />
            </Modal>
          </div>
        )}
        {viewingToolCapability && (
          <div className="modal-mask">
            <Modal
              title={viewingToolCapability.title}
              onClose={() => setViewingToolCapability(undefined)}
              actions={[
                <IconButton
                  key="close"
                  text={Locale.UI.Close}
                  bordered
                  onClick={() => setViewingToolCapability(undefined)}
                />,
                <IconButton
                  key="manager"
                  text={Locale.Discovery.OpenToolManager}
                  type="primary"
                  bordered
                  onClick={() => {
                    setViewingToolCapability(undefined);
                    navigate(Path.ToolMarket);
                  }}
                />,
              ]}
            >
              <div className={styles["tool-detail"]}>
                <div className={styles["tool-detail-row"]}>
                  <span>{Locale.Discovery.ToolStatus}</span>
                  <strong>{viewingToolCapability.status}</strong>
                </div>
                <div className={styles["tool-detail-row"]}>
                  <span>{Locale.Discovery.SourceLabel}</span>
                  <strong>{viewingToolCapability.source}</strong>
                </div>
                <div className={styles["tool-detail-row"]}>
                  <span>{Locale.Discovery.ConfigMode}</span>
                  <strong>{Locale.Discovery.ToolUserProvided}</strong>
                </div>
                <div className={styles["tool-detail-desc"]}>
                  {viewingToolCapability.description}
                </div>
                {viewingToolCapability.presetServer?.repo && (
                  <a
                    href={viewingToolCapability.presetServer.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {viewingToolCapability.presetServer.repo}
                  </a>
                )}
              </div>
            </Modal>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
