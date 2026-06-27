import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useNavigate } from "react-router-dom";
import {
  RouterApi,
  type RouterPublicToken,
  type RouterTokenStatus,
} from "../client/platforms/router";
import { buildTokenScopedRouterModelCatalog } from "./router-model-catalog";

const normalizeUrl = (value: string) => value.replace(/\/+$/, "");
const ROUTER_BASE_URL =
  getClientConfig()?.routerBackendUrl || "https://llm.yeying.pub/";
const ROUTER_BASE_URL_NORMALIZED = normalizeUrl(ROUTER_BASE_URL);

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
  if (isTextModel(model)) badges.push("文本");
  if (supportsImageGenerationEndpoint(model.supportedEndpoints))
    badges.push("生图");
  if (supportsImageEditEndpoint(model.supportedEndpoints)) badges.push("编辑");
  if (isReasoningModel(model)) badges.push("深度思考");
  return badges;
}

function formatRouterDate(value?: number) {
  if (!value || value <= 0) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未设置";
  return date.toLocaleString("zh-CN", { hour12: false });
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

  const showUsage = accessStore.isAuthorized();
  const showAccessCode =
    accessStore.enabledAccessControl() && !getClientConfig()?.isApp;
  const usage = {
    used: updateStore.used,
    subscription: updateStore.subscription,
  };

  const endpointValue = accessStore.openaiUrl || ROUTER_BASE_URL_NORMALIZED;
  const accessCodeConfigured = accessStore.accessCode.trim().length > 0;
  const selectedRouterToken = accessStore.selectedRouterToken?.trim() || "";
  const tokenConfigured = selectedRouterToken.length > 0;
  const availableTokens = useMemo(
    () => tokens.filter((token) => token && isRouterTokenSelectable(token)),
    [tokens],
  );
  const defaultToken = availableTokens[0];
  const selectedToken =
    availableTokens.find(
      (token) => (token.key || "").trim() === selectedRouterToken,
    ) || defaultToken;

  const updateRouterAccess = (updater: (state: typeof accessStore) => void) => {
    accessStore.update((state) => {
      state.provider = ServiceProvider.OpenAI;
      state.useCustomConfig = true;
      updater(state as typeof accessStore);
    });
  };

  async function checkUsage(force = false) {
    if (!showUsage) return;
    setLoadingUsage(true);
    try {
      await updateStore.updateUsage(force);
    } finally {
      setLoadingUsage(false);
    }
  }

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

  const reloadModels = useCallback(async () => {
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
  }, [mergeModels, setProviderModels]);

  async function loadTokens() {
    setLoadingTokens(true);
    try {
      const api = new RouterApi();
      const nextTokens = await api.publicTokens();
      setTokens(nextTokens);
    } finally {
      setLoadingTokens(false);
    }
  }

  useEffect(() => {
    void loadTokens();
  }, []);

  useEffect(() => {
    if (loadingTokens) return;
    const nextToken = selectedToken?.key?.trim() || "";
    if (selectedRouterToken === nextToken) return;
    accessStore.update((state) => {
      state.selectedRouterToken = nextToken;
    });
  }, [accessStore, loadingTokens, selectedRouterToken, selectedToken]);

  useEffect(() => {
    void loadTokenStatus();
  }, [selectedRouterToken]);

  useEffect(() => {
    if (!selectedRouterToken) {
      setTokenModels([]);
      return;
    }
    void reloadModels();
  }, [reloadModels, selectedRouterToken]);

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
                text="刷新模型"
                bordered
                onClick={() => void reloadModels()}
                disabled={loadingModels}
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
          <section className={styles.panel}>
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>Router 状态</div>
                <div className={styles["panel-subtitle"]}>
                  当前令牌状态和账户使用情况。
                </div>
              </div>
              <div className={styles["panel-actions"]}>
                <div className={styles["status-inline"]}>
                  {showAccessCode && (
                    <span
                      className={
                        accessCodeConfigured
                          ? styles["status-on"]
                          : styles["status-off"]
                      }
                    >
                      访问密码 {accessCodeConfigured ? "已配置" : "未配置"}
                    </span>
                  )}
                  <span
                    className={
                      tokenConfigured
                        ? styles["status-on"]
                        : styles["status-off"]
                    }
                  >
                    模型令牌 {tokenConfigured ? "已选择" : "未选择"}
                  </span>
                  <span
                    className={
                      showUsage ? styles["status-on"] : styles["status-off"]
                    }
                  >
                    余额查询 {showUsage ? "可用" : "未就绪"}
                  </span>
                </div>
                <div className={styles["action-pair"]}>
                  <IconButton
                    icon={<ResetIcon />}
                    text={loadingStatus ? "检查中" : "重新检查"}
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
                    <dt>当前令牌</dt>
                    <dd>
                      {loadingStatus
                        ? "检查中"
                        : tokenStatus?.token_name ||
                          selectedToken?.name ||
                          "未选择"}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>可用额度</dt>
                    <dd>
                      {loadingStatus
                        ? "检查中"
                        : tokenStatus?.unlimited_quota
                          ? "无限"
                          : (tokenStatus?.total_available ??
                            tokenStatus?.remaining_amount ??
                            "未获取")}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>已使用</dt>
                    <dd>
                      {loadingStatus
                        ? "检查中"
                        : (tokenStatus?.total_used ??
                          tokenStatus?.used_amount ??
                          "未获取")}
                    </dd>
                  </div>

                  <div className={styles["info-item"]}>
                    <dt>过期时间</dt>
                    <dd>
                      {loadingStatus
                        ? "检查中"
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

          <section className={styles.panel}>
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>Router 配置</div>
                <div className={styles["panel-subtitle"]}>
                  接入地址、访问密码和默认模型令牌。
                </div>
              </div>
            </div>

            <div className={styles.form}>
              <label className={styles.field}>
                <span className={styles["field-label"]}>接口地址</span>
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
                  默认地址：{ROUTER_BASE_URL_NORMALIZED}
                </span>
              </label>

              {showAccessCode && (
                <label className={styles.field}>
                  <span className={styles["field-label"]}>访问密码</span>
                  <input
                    type="password"
                    value={accessStore.accessCode}
                    placeholder={Locale.Settings.Access.AccessCode.Placeholder}
                    onChange={(e) => {
                      accessStore.update(
                        (state) => (state.accessCode = e.currentTarget.value),
                      );
                    }}
                  />
                  <span className={styles["field-hint"]}>
                    访问受控 Router 时使用。
                  </span>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles["field-label"]}>令牌</span>
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
                      const label = token.name || "未命名";
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
                      {loadingTokens ? "令牌加载中" : "未找到可用令牌"}
                    </option>
                  )}
                </select>
                <span className={styles["field-hint"]}>
                  文本、图片、语音和模型列表都会优先使用这里选择的令牌。
                </span>
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles["panel-header"]}>
              <div>
                <div className={styles["panel-title"]}>支持模型</div>
                <div className={styles["panel-subtitle"]}>
                  当前令牌可用的模型。
                </div>
              </div>
            </div>

            <div className={styles.toolbar}>
              <input
                className={styles.search}
                value={searchText}
                placeholder="搜索模型名、供应商、端点"
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
              <div className={styles.filters}>
                {[
                  ["all", "全部"],
                  ["text", "文本"],
                  ["image", "图片"],
                  ["reasoning", "深度思考"],
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
                      <th>模型</th>
                      <th>供应商</th>
                      <th>能力</th>
                      <th>端点</th>
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
                                <span className={styles.chip}>通用</span>
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
                                  未声明端点
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
                  ? "模型加载中"
                  : selectedRouterToken
                    ? "当前令牌没有返回可用模型"
                    : "请选择令牌后加载模型"}
              </div>
            )}
          </section>
        </div>
      </div>
    </ErrorBoundary>
  );
}
