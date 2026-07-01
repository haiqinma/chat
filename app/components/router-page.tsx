import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./router-page.module.scss";

import ResetIcon from "../icons/reload.svg";
import CloseIcon from "../icons/close.svg";
import { IconButton } from "./button";
import {
  useAccessStore,
  useAppConfig,
  useSkillProviderModelsStore,
  useUpdateStore,
} from "../store";
import Locale from "../locales";
import { ErrorBoundary } from "./error";
import { getClientConfig } from "../config/client";
import {
  getRouterClientApi,
  normalizeSupportedEndpoints,
  supportsImageEditEndpoint,
  supportsImageGenerationEndpoint,
  supportsTextEndpoint,
  type LLMModel,
  SupportedEndpoint,
  SupportedTextEndpoint,
} from "../client/api";
import { isReasoningCapableModel } from "../client/reasoning";
import { Path, ServiceProvider } from "../constant";
import { useLocation, useNavigate } from "react-router-dom";
import {
  RouterApi,
  type RouterPublicToken,
  type RouterTokenStatus,
} from "../client/platforms/router";
import { buildTokenScopedRouterModelCatalog } from "./router-model-catalog";
import { getLang } from "../locales";
import {
  getAccountWorkspaceOwner,
  getAccountWorkspaceStatus,
  subscribeAccountWorkspaceStatus,
} from "../utils/account-workspace";

const normalizeUrl = (value: string) => value.replace(/\/+$/, "");
const ROUTER_BASE_URL =
  getClientConfig()?.routerBackendUrl || "https://llm.yeying.pub/";
const ROUTER_BASE_URL_NORMALIZED = normalizeUrl(ROUTER_BASE_URL);
const ROUTER_PORTAL_URL =
  getClientConfig()?.routerPortalUrl || "https://router.yeying.pub";
const ROUTER_PORTAL_TOKEN_URL =
  getClientConfig()?.routerPortalTokenUrl || ROUTER_PORTAL_URL;
const ROUTER_PORTAL_RECHARGE_URL =
  getClientConfig()?.routerPortalRechargeUrl || ROUTER_PORTAL_TOKEN_URL;

type ModelFilter = "all" | "text" | "image" | "reasoning";

function getModelTags(model: LLMModel) {
  return Array.isArray(model.tags) ? model.tags : [];
}

function isImageModel(model: LLMModel) {
  const tags = getModelTags(model);
  const modelType = model.modelType?.trim().toLowerCase();
  return (
    tags.includes("image") ||
    modelType === "image" ||
    supportsImageGenerationEndpoint(model.supportedEndpoints) ||
    supportsImageEditEndpoint(model.supportedEndpoints)
  );
}

function isTextModel(model: LLMModel) {
  return supportsTextEndpoint(model.supportedEndpoints);
}

function isReasoningModel(model: LLMModel) {
  return isReasoningCapableModel({
    model: model.name,
    providerName: model.provider?.providerName,
    ownedBy: model.ownedBy,
    tags: model.tags,
  });
}

function getModelKind(model: LLMModel) {
  if (isImageModel(model)) return "image";
  if (isReasoningModel(model)) return "reasoning";
  if (isTextModel(model)) return "text";
  return "other";
}

function endpointLabel(endpoint: string) {
  switch (endpoint) {
    case SupportedTextEndpoint.Responses:
      return "responses";
    case SupportedTextEndpoint.Messages:
      return "messages";
    case SupportedTextEndpoint.ChatCompletions:
      return "chat";
    case SupportedEndpoint.ImagesGenerations:
      return "image gen";
    case SupportedEndpoint.ImagesEdits:
      return "image edit";
    default:
      return endpoint.replace(/^\/v1\//, "");
  }
}

function maskRouterTokenKey(value?: string) {
  const token = value?.trim() || "";
  if (!token) return "";
  const visiblePrefix = token.slice(0, Math.min(6, token.length));
  const visibleSuffix = token.length > 10 ? token.slice(-4) : "";
  if (!visibleSuffix) return `${visiblePrefix}***`;
  return `${visiblePrefix}***${visibleSuffix}`;
}

function capabilityBadges(model: LLMModel) {
  const badges: string[] = [];
  if (isTextModel(model)) badges.push(Locale.Router.Models.Capabilities.Text);
  if (supportsImageGenerationEndpoint(model.supportedEndpoints))
    badges.push(Locale.Router.Models.Capabilities.Image);
  if (supportsImageEditEndpoint(model.supportedEndpoints))
    badges.push(Locale.Router.Models.Capabilities.Edit);
  if (isReasoningModel(model))
    badges.push(Locale.Router.Models.Capabilities.Reasoning);
  return badges;
}

function formatRouterDate(value?: number) {
  if (!value || value <= 0) return Locale.Router.Status.NotSet;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Locale.Router.Status.NotSet;
  return date.toLocaleString(getLang() === "cn" ? "zh-CN" : "en-US", {
    hour12: false,
  });
}

function isRouterTokenSelectable(token: RouterPublicToken) {
  const status = token.status;
  const statusValue =
    typeof status === "string" ? status.trim().toLowerCase() : status;
  const statusOk =
    statusValue === undefined ||
    statusValue === null ||
    statusValue === "" ||
    statusValue === 1 ||
    statusValue === "1" ||
    statusValue === "enabled" ||
    statusValue === "active";

  if (!statusOk) return false;

  if (token.unlimited_quota === true) return true;

  const remaining = token.remaining_amount ?? token.remain_quota;
  if (remaining === undefined || remaining === null) return true;
  return Number(remaining) > 0;
}

export function RouterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const configPanelRef = useRef<HTMLElement | null>(null);
  const mergeModels = useAppConfig((state) => state.mergeModels);
  const accessStore = useAccessStore();
  const updateStore = useUpdateStore();
  const providerModels = useSkillProviderModelsStore((state) => state.models);
  const setProviderModels = useSkillProviderModelsStore(
    (state) => state.setModels,
  );
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<ModelFilter>("all");
  const [tokens, setTokens] = useState<RouterPublicToken[]>([]);
  const [tokenModels, setTokenModels] = useState<LLMModel[]>([]);
  const [tokenStatus, setTokenStatus] = useState<RouterTokenStatus | null>(
    null,
  );
  const [workspaceOwner, setWorkspaceOwner] = useState(() =>
    getAccountWorkspaceOwner(),
  );
  const [workspaceStatus, setWorkspaceStatus] = useState(() =>
    getAccountWorkspaceStatus(),
  );
  const workspaceReady = workspaceStatus === "ready";

  useEffect(() => {
    const unsubscribe = subscribeAccountWorkspaceStatus(() => {
      setWorkspaceOwner(getAccountWorkspaceOwner());
      setWorkspaceStatus(getAccountWorkspaceStatus());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const catalogModels = useMemo(() => {
    const map = new Map<string, LLMModel>();
    const source = buildTokenScopedRouterModelCatalog(
      tokenModels,
      providerModels,
    );

    source.forEach((model) => {
      const providerId =
        model.provider?.id ||
        model.provider?.providerName ||
        model.ownedBy ||
        "unknown";
      map.set(`${model.name}@${providerId}`, model);
    });
    return Array.from(map.values());
  }, [providerModels, tokenModels]);

  const visibleModels = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return catalogModels.filter((model) => {
      const kind = getModelKind(model);
      const matchesFilter =
        filter === "all" ||
        (filter === "text" && isTextModel(model)) ||
        (filter === "image" && isImageModel(model)) ||
        (filter === "reasoning" && isReasoningModel(model));
      if (!matchesFilter) return false;

      if (!keyword) return true;
      const haystack = [
        model.name,
        model.displayName,
        model.provider?.providerName,
        model.ownedBy,
        ...getModelTags(model),
        ...normalizeSupportedEndpoints(model.supportedEndpoints),
        kind,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [catalogModels, filter, searchText]);

  const endpointValue = accessStore.openaiUrl || ROUTER_BASE_URL_NORMALIZED;
  const selectedRouterToken = accessStore.selectedRouterToken?.trim() || "";
  const tokenFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("token") || "").trim();
  }, [location.search]);
  const tokenConfigured = selectedRouterToken.length > 0;
  const routerApiKeyConfigured = accessStore.openaiApiKey.trim().length > 0;
  const showUsage = tokenConfigured || routerApiKeyConfigured;
  const usage = {
    used: updateStore.used,
    subscription: updateStore.subscription,
  };
  const availableTokens = useMemo(
    () => tokens.filter((token) => token && isRouterTokenSelectable(token)),
    [tokens],
  );
  const defaultToken = availableTokens[0];
  const selectedToken =
    availableTokens.find(
      (token) => (token.key || "").trim() === selectedRouterToken,
    ) || defaultToken;
  const redirectTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = (params.get("redirect") || Path.NewChat).trim();
    if (!raw.startsWith("/")) return Path.NewChat;
    return raw === Path.Router ? Path.NewChat : raw;
  }, [location.search]);
  const routerAction = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("action") || "").trim().toLowerCase();
  }, [location.search]);
  const canReturnToChat = tokenConfigured || tokenModels.length > 0;

  const updateRouterAccess = (updater: (state: typeof accessStore) => void) => {
    accessStore.update((state) => {
      state.provider = ServiceProvider.OpenAI;
      state.useCustomConfig = true;
      updater(state as typeof accessStore);
    });
  };

  const checkUsage = useCallback(
    async (force = false) => {
      if (!showUsage) return;
      setLoadingUsage(true);
      try {
        await updateStore.updateUsage(force);
      } finally {
        setLoadingUsage(false);
      }
    },
    [showUsage, updateStore],
  );

  async function loadTokenStatus() {
    setLoadingStatus(true);
    try {
      const api = new RouterApi();
      const nextStatus = await api.publicTokenStatus();
      setTokenStatus(nextStatus);
    } finally {
      setLoadingStatus(false);
    }
  }

  const routerActionContent = useMemo(() => {
    switch (routerAction) {
      case "select":
        return {
          title: Locale.Router.Banner.SelectTitle,
          description: Locale.Router.Banner.SelectDesc,
          primaryText: Locale.Router.Banner.SelectPrimary,
          primaryAction: () => window.open(ROUTER_PORTAL_TOKEN_URL, "_blank"),
          secondaryText: Locale.Router.Banner.SelectSecondary,
          secondaryAction: () => navigate(redirectTarget),
        };
      case "recharge":
        return {
          title: Locale.Router.Banner.RechargeTitle,
          description: Locale.Router.Banner.RechargeDesc,
          primaryText: Locale.Router.Banner.RechargePrimary,
          primaryAction: () =>
            window.open(ROUTER_PORTAL_RECHARGE_URL, "_blank"),
          secondaryText: Locale.Router.Banner.RechargeSecondary,
          secondaryAction: () => {
            void loadTokenStatus();
            void checkUsage(true);
          },
        };
      case "renew":
        return {
          title: Locale.Router.Banner.RenewTitle,
          description: Locale.Router.Banner.RenewDesc,
          primaryText: Locale.Router.Banner.RenewPrimary,
          primaryAction: () =>
            window.open(ROUTER_PORTAL_RECHARGE_URL, "_blank"),
          secondaryText: Locale.Router.Banner.RenewSecondary,
          secondaryAction: () => {
            void loadTokenStatus();
            void checkUsage(true);
          },
        };
      case "disabled":
        return {
          title: Locale.Router.Banner.DisabledTitle,
          description: Locale.Router.Banner.DisabledDesc,
          primaryText: Locale.Router.Banner.DisabledPrimary,
          primaryAction: () => {
            configPanelRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          },
          secondaryText: Locale.Router.Banner.DisabledSecondary,
          secondaryAction: () => navigate(redirectTarget),
        };
      case "token":
        return {
          title: Locale.Router.Banner.TokenTitle,
          description: Locale.Router.Banner.TokenDesc,
          primaryText: Locale.Router.Banner.TokenPrimary,
          primaryAction: () => {
            void loadTokenStatus();
            void checkUsage(true);
          },
          secondaryText: Locale.Router.Banner.TokenSecondary,
          secondaryAction: () => navigate(redirectTarget),
        };
      default:
        return null;
    }
  }, [checkUsage, navigate, redirectTarget, routerAction]);

  const resetRouterRuntimeState = useCallback(() => {
    setTokens([]);
    setTokenModels([]);
    setProviderModels([]);
    setTokenStatus(null);
  }, [setProviderModels]);

  const reloadModels = useCallback(async () => {
    if (!workspaceReady) return;
    setLoadingModels(true);
    setTokenModels([]);
    try {
      const api = getRouterClientApi();
      const [models, nextProviderModels] = await Promise.all([
        api.llm.models(),
        api.llm.providerModels?.() ?? Promise.resolve([]),
      ]);
      setTokenModels(models);
      mergeModels(models);
      setProviderModels(nextProviderModels);
    } finally {
      setLoadingModels(false);
    }
  }, [mergeModels, setProviderModels, workspaceReady]);

  const loadTokens = useCallback(async () => {
    if (!workspaceReady) return;
    setLoadingTokens(true);
    try {
      const api = new RouterApi();
      const nextTokens = await api.publicTokens();
      setTokens(nextTokens);
    } finally {
      setLoadingTokens(false);
    }
  }, [workspaceReady]);

  useEffect(() => {
    resetRouterRuntimeState();
  }, [resetRouterRuntimeState, workspaceOwner]);

  useEffect(() => {
    if (!workspaceReady) return;
    void loadTokens();
  }, [loadTokens, workspaceOwner, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) return;
    if (loadingTokens) return;
    if (tokenFromQuery) {
      if (selectedRouterToken !== tokenFromQuery) {
        accessStore.update((state) => {
          state.selectedRouterToken = tokenFromQuery;
        });
      }
      const params = new URLSearchParams(location.search);
      params.delete("token");
      const nextSearch = params.toString();
      navigate(`${Path.Router}${nextSearch ? `?${nextSearch}` : ""}`, {
        replace: true,
      });
      return;
    }

    const nextToken = selectedToken?.key?.trim() || "";
    if (!nextToken) return;
    if (selectedRouterToken === nextToken) return;
    accessStore.update((state) => {
      state.selectedRouterToken = nextToken;
    });
  }, [
    accessStore,
    loadingTokens,
    location.search,
    navigate,
    selectedRouterToken,
    selectedToken,
    tokenFromQuery,
    workspaceReady,
  ]);

  useEffect(() => {
    if (!workspaceReady) {
      setTokenStatus(null);
      return;
    }
    void loadTokenStatus();
  }, [selectedRouterToken, workspaceOwner, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      setTokenModels([]);
      return;
    }
    if (!selectedRouterToken) {
      setTokenModels([]);
      return;
    }
    void reloadModels();
  }, [reloadModels, selectedRouterToken, workspaceOwner, workspaceReady]);

  useEffect(() => {
    if (routerAction !== "token") return;
    const panel = configPanelRef.current;
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.classList.add(styles["panel-focus"]);
    const timer = window.setTimeout(() => {
      panel.classList.remove(styles["panel-focus"]);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      panel.classList.remove(styles["panel-focus"]);
    };
  }, [routerAction]);

  return (
    <ErrorBoundary>
      <div className={styles["router-page"]}>
        <div className="window-header" data-tauri-drag-region>
          <div className="window-header-title">
            <div className="window-header-main-title">
              {Locale.Discovery.RouterProviderTitle}
            </div>
            <div className="window-header-sub-title">
              {Locale.Discovery.RouterProviderDesc}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ResetIcon />}
                text={Locale.Router.RefreshModels}
                bordered
                onClick={() => void reloadModels()}
                disabled={loadingModels}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                text={
                  canReturnToChat
                    ? Locale.Router.ReturnToChat
                    : Locale.Router.ReturnToNewChat
                }
                bordered
                onClick={() => navigate(redirectTarget)}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                aria={Locale.UI.Close}
                icon={<CloseIcon />}
                onClick={() => navigate(Path.Discovery)}
                bordered
              />
            </div>
          </div>
        </div>

        <div className={styles["router-content"]}>
          {routerActionContent && (
            <section className={styles["action-banner"]}>
              <div className={styles["action-banner-copy"]}>
                <div className={styles["action-banner-title"]}>
                  {routerActionContent.title}
                </div>
                <div className={styles["action-banner-desc"]}>
                  {routerActionContent.description}
                </div>
              </div>
              <div className={styles["action-banner-actions"]}>
                <button
                  type="button"
                  className={styles["action-banner-primary"]}
                  onClick={routerActionContent.primaryAction}
                >
                  {routerActionContent.primaryText}
                </button>
                <button
                  type="button"
                  className={styles["action-banner-secondary"]}
                  onClick={routerActionContent.secondaryAction}
                >
                  {routerActionContent.secondaryText}
                </button>
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>
                  {Locale.Router.Status.Title}
                </div>
                <div className={styles["panel-subtitle"]}>
                  {Locale.Router.Status.SubTitle}
                </div>
              </div>
              <div className={styles["panel-actions"]}>
                <div className={styles["status-inline"]}>
                  <span
                    className={
                      tokenConfigured
                        ? styles["status-on"]
                        : styles["status-off"]
                    }
                  >
                    {tokenConfigured
                      ? Locale.Router.Status.TokenReady
                      : Locale.Router.Status.TokenMissing}
                  </span>
                  <span
                    className={
                      showUsage ? styles["status-on"] : styles["status-off"]
                    }
                  >
                    {showUsage
                      ? Locale.Router.Status.UsageReady
                      : Locale.Router.Status.UsagePending}
                  </span>
                </div>
                <div className={styles["action-pair"]}>
                  <IconButton
                    icon={<ResetIcon />}
                    text={
                      loadingStatus
                        ? Locale.Router.Status.Checking
                        : Locale.Router.Banner.TokenPrimary
                    }
                    bordered
                    onClick={() => {
                      void loadTokenStatus();
                      void checkUsage(true);
                    }}
                    disabled={loadingStatus || loadingUsage}
                  />
                </div>
              </div>
            </div>

            <div className={styles["status-layout"]}>
              <div className={styles["status-main"]}>
                <dl className={styles["info-list"]}>
                  <div className={styles["info-item"]}>
                    <dt>{Locale.Router.Status.TokenName}</dt>
                    <dd>
                      {loadingStatus
                        ? Locale.Router.Status.Checking
                        : tokenStatus?.token_name ||
                          selectedToken?.name ||
                          Locale.Router.Status.NotSelected}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>{Locale.Router.Status.AvailableQuota}</dt>
                    <dd>
                      {loadingStatus
                        ? Locale.Router.Status.Checking
                        : tokenStatus?.unlimited_quota
                          ? Locale.Router.Status.Unlimited
                          : (tokenStatus?.total_available ??
                            tokenStatus?.remaining_amount ??
                            Locale.Router.Status.Unavailable)}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>{Locale.Router.Status.UsedQuota}</dt>
                    <dd>
                      {loadingStatus
                        ? Locale.Router.Status.Checking
                        : (tokenStatus?.total_used ??
                          tokenStatus?.used_amount ??
                          Locale.Router.Status.Unavailable)}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>{Locale.Router.Status.ExpiresAt}</dt>
                    <dd>
                      {loadingStatus
                        ? Locale.Router.Status.Checking
                        : formatRouterDate(tokenStatus?.expires_at)}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>{Locale.Settings.Usage.Title}</dt>
                    <dd>
                      {showUsage
                        ? loadingUsage
                          ? Locale.Settings.Usage.IsChecking
                          : Locale.Settings.Usage.SubTitle(
                              usage.used ?? "[?]",
                              usage.subscription ?? "[?]",
                            )
                        : Locale.Settings.Usage.NoAccess}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section
            ref={configPanelRef}
            className={styles.panel}
            data-router-section="token"
          >
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>
                  {Locale.Router.Config.Title}
                </div>
                <div className={styles["panel-subtitle"]}>
                  {Locale.Router.Config.SubTitle}
                </div>
              </div>
            </div>

            <div className={styles.form}>
              <label className={styles.field}>
                <span className={styles["field-label"]}>
                  {Locale.Router.Config.Endpoint}
                </span>
                <input
                  type="text"
                  value={endpointValue}
                  placeholder={ROUTER_BASE_URL_NORMALIZED}
                  onChange={(e) =>
                    updateRouterAccess((state) => {
                      state.openaiUrl = e.currentTarget.value;
                    })
                  }
                />
                <span className={styles["field-hint"]}>
                  {Locale.Router.Config.EndpointHint(
                    ROUTER_BASE_URL_NORMALIZED,
                  )}
                </span>
              </label>

              <label className={styles.field}>
                <span className={styles["field-label"]}>
                  {Locale.Router.Config.Token}
                </span>
                <select
                  value={selectedRouterToken}
                  onChange={(e) =>
                    accessStore.update((state) => {
                      state.selectedRouterToken = e.currentTarget.value;
                    })
                  }
                  disabled={loadingTokens || availableTokens.length === 0}
                >
                  {availableTokens.length > 0 ? (
                    availableTokens.map((token) => {
                      const label =
                        token.name || Locale.Router.Config.UnnamedToken;
                      return (
                        <option
                          key={token.id || token.key}
                          value={token.key || ""}
                        >
                          {label}
                          {token.key
                            ? ` (${maskRouterTokenKey(token.key)})`
                            : ""}
                        </option>
                      );
                    })
                  ) : (
                    <option value="">
                      {loadingTokens
                        ? Locale.Router.Config.TokensLoading
                        : Locale.Router.Config.NoTokens}
                    </option>
                  )}
                </select>
                <span className={styles["field-hint"]}>
                  {Locale.Router.Config.TokenHint}
                </span>
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>
                  {Locale.Router.Models.Title}
                </div>
                <div className={styles["panel-subtitle"]}>
                  {Locale.Router.Models.SubTitle}
                </div>
              </div>
            </div>

            <div className={styles.toolbar}>
              <input
                className={styles.search}
                value={searchText}
                placeholder={Locale.Router.Models.SearchPlaceholder}
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
              <div className={styles.filters}>
                {[
                  ["all", Locale.Router.Models.Filters.all],
                  ["text", Locale.Router.Models.Filters.text],
                  ["image", Locale.Router.Models.Filters.image],
                  ["reasoning", Locale.Router.Models.Filters.reasoning],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      filter === value ? styles["filter-active"] : styles.filter
                    }
                    onClick={() => setFilter(value as ModelFilter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visibleModels.length > 0 ? (
              <div className={styles["table-shell"]}>
                <table className={styles["model-table"]}>
                  <thead>
                    <tr>
                      <th>{Locale.Router.Models.Headers.Model}</th>
                      <th>{Locale.Router.Models.Headers.Provider}</th>
                      <th>{Locale.Router.Models.Headers.Capabilities}</th>
                      <th>{Locale.Router.Models.Headers.Endpoints}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleModels.map((model) => {
                      const endpoints = normalizeSupportedEndpoints(
                        model.supportedEndpoints,
                      );
                      const capabilities = capabilityBadges(model);
                      const providerName =
                        model.provider?.providerName ||
                        model.ownedBy ||
                        "Unknown";
                      return (
                        <tr key={`${model.name}@${providerName}`}>
                          <td className={styles["cell-model"]}>
                            <div className={styles["model-title"]}>
                              {model.displayName || model.name}
                            </div>
                            <div className={styles["model-name"]}>
                              {model.name}
                            </div>
                          </td>
                          <td className={styles["cell-provider"]}>
                            {providerName}
                          </td>
                          <td>
                            <div className={styles["cell-tags"]}>
                              {capabilities.length > 0 ? (
                                capabilities.map((item) => (
                                  <span
                                    key={item}
                                    className={styles["chip-accent"]}
                                  >
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span className={styles.chip}>
                                  {Locale.Router.Models.Capabilities.General}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className={styles["cell-tags"]}>
                              {endpoints.length > 0 ? (
                                endpoints.map((endpoint) => (
                                  <span
                                    key={endpoint}
                                    className={styles["endpoint-chip"]}
                                  >
                                    {endpointLabel(endpoint)}
                                  </span>
                                ))
                              ) : (
                                <span className={styles["summary-empty"]}>
                                  {Locale.Router.Models.EmptyEndpoint}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                {loadingModels
                  ? Locale.Router.Models.Loading
                  : selectedRouterToken
                    ? Locale.Router.Models.EmptyWithToken
                    : Locale.Router.Models.EmptyWithoutToken}
              </div>
            )}
          </section>
        </div>
      </div>
    </ErrorBoundary>
  );
}
