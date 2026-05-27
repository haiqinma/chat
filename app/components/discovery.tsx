import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

import { Path } from "../constant";
import Locale, { getLang } from "../locales";
import { getClientsStatus, getMcpConfigFromFile } from "../mcp/actions";
import { OFFICIAL_MCP_PRESET_SERVERS } from "../mcp/preset-servers";
import { McpConfigData, ServerStatusResponse } from "../mcp/types";
import { BUILTIN_SKILLS } from "../skills";
import { useAppConfig } from "../store";
import { useSkillStore } from "../store/skill";
import { usePluginStore } from "../store/plugin";
import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import CloseIcon from "../icons/close.svg";
import EyeIcon from "../icons/eye.svg";
import styles from "./discovery.module.scss";

type CapabilityType = "all" | "skill" | "tool" | "provider";
type PricingType = "free" | "subscription" | "usage";
type RuntimeType = "cloud" | "local" | "both";
type DiscoveryView = "market" | "mine";

type Capability = {
  id: string;
  type: Exclude<CapabilityType, "all">;
  title: string;
  description: string;
  status: string;
  pricing: PricingType;
  runtime: RuntimeType;
  source: string;
  path: Path;
  installed: boolean;
};

const typeOrder: CapabilityType[] = ["all", "skill", "tool", "provider"];

function getInitialType(search: string): CapabilityType {
  const type = new URLSearchParams(search).get("type");
  if (type === "model") return "provider";
  if (type === "skill" || type === "tool" || type === "provider") return type;
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

export function DiscoveryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const view = getInitialView(location.search);
  const activeType = getInitialType(location.search);
  const [searchText, setSearchText] = useState("");
  const skillRecords = useSkillStore((state) => state.skills);
  const pluginRecords = usePluginStore((state) => state.plugins);
  const models = useAppConfig((state) => state.models);
  const hideBuiltinSkills = useAppConfig((state) => state.hideBuiltinSkills);
  const modelConfig = useAppConfig((state) => state.modelConfig);
  const [mcpConfig, setMcpConfig] = useState<McpConfigData>();
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, ServerStatusResponse>
  >({});

  useEffect(() => {
    let cancelled = false;
    const loadMcpState = async () => {
      try {
        const [config, statuses] = await Promise.all([
          getMcpConfigFromFile(),
          getClientsStatus(),
        ]);
        if (cancelled) return;
        setMcpConfig(config);
        setMcpStatuses(statuses);
      } catch (error) {
        console.warn("[Discovery] failed to load MCP state", error);
      }
    };
    loadMcpState();
    return () => {
      cancelled = true;
    };
  }, []);

  const skills = useMemo(() => {
    const userSkills = Object.values(skillRecords).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    if (hideBuiltinSkills) return userSkills;

    const seen = new Set<string>();
    const builtinSkills = BUILTIN_SKILLS.filter((skill) => {
      if (skill.lang !== getLang() || seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    }).map((skill) => ({
      ...skill,
      modelConfig: {
        ...modelConfig,
        ...skill.modelConfig,
      },
    }));

    return [...userSkills, ...builtinSkills];
  }, [hideBuiltinSkills, modelConfig, skillRecords]);
  const plugins = useMemo(
    () =>
      Object.values(pluginRecords).sort((a, b) => b.createdAt - a.createdAt),
    [pluginRecords],
  );

  const capabilities = useMemo<Capability[]>(() => {
    const skillItems = skills.map((skill) => ({
      id: `skill:${"id" in skill ? skill.id : skill.name}`,
      type: "skill" as const,
      title: skill.name,
      description: skill.description || Locale.Discovery.DefaultSkillDesc,
      status: skill.builtin
        ? Locale.Discovery.Status.Enabled
        : Locale.Discovery.Status.Installed,
      pricing: "free" as const,
      runtime: "both" as const,
      source: skill.builtin
        ? Locale.Discovery.Source.Official
        : Locale.Discovery.Source.Custom,
      path: Path.Skills,
      installed: !skill.builtin,
    }));

    const mcpToolItems: Capability[] = OFFICIAL_MCP_PRESET_SERVERS.map(
      (server) => {
        const serverConfig = mcpConfig?.mcpServers[server.id];
        const serverStatus = mcpStatuses[server.id]?.status;
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
          id: `tool:mcp:${server.id}`,
          type: "tool",
          title: server.name,
          description: server.description,
          status,
          pricing: "free",
          runtime: server.tags.includes("local") ? "local" : "both",
          source: Locale.Discovery.Source.Official,
          path: Path.McpMarket,
          installed,
        };
      },
    );

    const pluginToolItems: Capability[] = plugins.map((plugin) => ({
      id: `tool:${plugin.id}`,
      type: "tool" as const,
      title: plugin.title || Locale.Plugin.Name,
      description: Locale.Discovery.ToolApiDesc,
      status: Locale.Discovery.Status.Installed,
      pricing: "free" as const,
      runtime: "cloud" as const,
      source: plugin.builtin
        ? Locale.Discovery.Source.Official
        : Locale.Discovery.Source.Custom,
      path: Path.Plugins,
      installed: true,
    }));

    const toolItems: Capability[] = [
      ...mcpToolItems,
      {
        id: "tool:plugins",
        type: "tool",
        title: Locale.Discovery.ToolApiTitle,
        description: Locale.Discovery.ToolApiDesc,
        status: Locale.Discovery.Status.Configurable,
        pricing: "free",
        runtime: "cloud",
        source: Locale.Discovery.Source.Official,
        path: Path.Plugins,
        installed: false,
      },
      ...pluginToolItems,
    ];

    const providerMap = new Map<
      string,
      {
        title: string;
        total: number;
        available: number;
        tags: Set<string>;
      }
    >();
    providerMap.set("router", {
      title: Locale.Discovery.RouterProviderTitle,
      total: 0,
      available: 0,
      tags: new Set(["router"]),
    });

    models.forEach((model) => {
      const providerName =
        model.provider?.providerName?.trim() ||
        model.ownedBy?.trim() ||
        Locale.Discovery.Source.Provider;
      const key = providerName.toLowerCase();
      const provider = providerMap.get(key) ?? {
        title: providerName,
        total: 0,
        available: 0,
        tags: new Set<string>(),
      };
      provider.total += 1;
      if (model.available) provider.available += 1;
      model.tags?.forEach((tag) => provider.tags.add(tag));
      providerMap.set(key, provider);
    });

    const providerItems: Capability[] = Array.from(providerMap.entries()).map(
      ([key, provider]) => ({
        id: `provider:${key}`,
        type: "provider",
        title: provider.title,
        description:
          provider.total > 0
            ? Locale.Discovery.ProviderDesc(
                provider.available,
                provider.total,
                Array.from(provider.tags).slice(0, 4),
              )
            : Locale.Discovery.RouterProviderDesc,
        status:
          provider.available > 0 || key === "router"
            ? Locale.Discovery.Status.Enabled
            : Locale.Discovery.Status.Unavailable,
        pricing: "usage",
        runtime: "cloud",
        source:
          key === "router"
            ? Locale.Discovery.Source.Official
            : Locale.Discovery.Source.Provider,
        path: Path.Settings,
        installed: provider.available > 0 || key === "router",
      }),
    );

    const sortedProviderItems = providerItems.sort((a, b) => {
      if (a.id === "provider:router") return -1;
      if (b.id === "provider:router") return 1;
      return a.title.localeCompare(b.title);
    });

    return [...skillItems, ...toolItems, ...sortedProviderItems];
  }, [mcpConfig?.mcpServers, mcpStatuses, models, plugins, skills]);

  const visibleCapabilities = capabilities.filter((item) => {
    const keyword = searchText.trim().toLowerCase();
    const matchType = activeType === "all" || item.type === activeType;
    const matchView = view === "market" || item.installed;
    const matchSearch =
      !keyword ||
      [item.title, item.description, item.source, item.status]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    return matchType && matchView && matchSearch;
  });

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
              <div key={item.id} className={styles.card}>
                <div className={styles["card-header"]}>
                  <div className={styles["card-title"]}>{item.title}</div>
                  <span className={styles.badge}>{item.status}</span>
                </div>
                <div className={styles["card-desc"]}>{item.description}</div>
                <div className={styles.badges}>
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
                    text={
                      view === "market" && !item.installed
                        ? Locale.Discovery.Enable
                        : Locale.Discovery.Manage
                    }
                    bordered
                    onClick={() => navigate(item.path)}
                  />
                </div>
              </div>
            ))}
            {visibleCapabilities.length === 0 && (
              <div className={styles.empty}>{Locale.Discovery.Empty}</div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
