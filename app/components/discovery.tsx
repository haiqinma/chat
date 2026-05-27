import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

import { Path } from "../constant";
import Locale from "../locales";
import { useAppConfig } from "../store";
import { useSkillStore } from "../store/skill";
import { usePluginStore } from "../store/plugin";
import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import CloseIcon from "../icons/close.svg";
import EyeIcon from "../icons/eye.svg";
import styles from "./discovery.module.scss";

type CapabilityType = "skill" | "tool" | "model";
type PricingType = "free" | "subscription" | "usage";
type RuntimeType = "cloud" | "local" | "both";

type Capability = {
  id: string;
  type: CapabilityType;
  title: string;
  description: string;
  status: string;
  pricing: PricingType;
  runtime: RuntimeType;
  source: string;
  path: Path;
};

const typeOrder: CapabilityType[] = ["skill", "tool", "model"];

export function DiscoveryPage() {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState<CapabilityType>("skill");
  const skills = useSkillStore((state) => state.getAll());
  const plugins = usePluginStore((state) => state.getAll());
  const models = useAppConfig((state) => state.models);

  const capabilities = useMemo<Capability[]>(() => {
    const skillItems = skills.map((skill) => ({
      id: `skill:${skill.id}`,
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
    }));

    const toolItems: Capability[] = [
      {
        id: "tool:mcp",
        type: "tool",
        title: Locale.Discovery.ToolMcpTitle,
        description: Locale.Discovery.ToolMcpDesc,
        status: Locale.Discovery.Status.Configurable,
        pricing: "free",
        runtime: "both",
        source: Locale.Discovery.Source.Official,
        path: Path.McpMarket,
      },
      ...plugins.map((plugin) => ({
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
      })),
    ];

    const modelItems = models.slice(0, 60).map((model) => ({
      id: `model:${model.provider?.providerName || "model"}:${model.name}`,
      type: "model" as const,
      title: model.displayName || model.name,
      description:
        model.description ||
        model.tags?.slice(0, 4).join(" / ") ||
        Locale.Discovery.DefaultModelDesc,
      status: model.available
        ? Locale.Discovery.Status.Enabled
        : Locale.Discovery.Status.Unavailable,
      pricing: "usage" as const,
      runtime: "cloud" as const,
      source: model.provider?.providerName || Locale.Discovery.Source.Provider,
      path: Path.Settings,
    }));

    return [...skillItems, ...toolItems, ...modelItems];
  }, [models, plugins, skills]);

  const visibleCapabilities = capabilities.filter(
    (item) => item.type === activeType,
  );

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
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
              />
            </div>
          </div>
        </div>

        <div className={styles["discovery-body"]}>
          <div className={styles.tabs}>
            {typeOrder.map((type) => (
              <button
                key={type}
                type="button"
                className={clsx(
                  styles.tab,
                  activeType === type && styles["tab-active"],
                )}
                onClick={() => setActiveType(type)}
              >
                {Locale.Discovery.Types[type]}
              </button>
            ))}
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
                    text={Locale.Discovery.Manage}
                    bordered
                    onClick={() => navigate(item.path)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
