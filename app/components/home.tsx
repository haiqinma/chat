"use client";

require("../polyfill");

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import styles from "./home.module.scss";

import BotIcon from "../icons/bot.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { getCSSVar, useMobileScreen } from "../utils";

import dynamic from "next/dynamic";
import { Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";

import { getISOLang } from "../locales";

import {
  HashRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import { AuthPage } from "./auth";
import { getClientConfig } from "../config/client";
import { getRouterClientApi } from "../client/api";
import { useAccessStore, useSkillProviderModelsStore } from "../store";
import clsx from "clsx";
import { initializeMcpSystem, isMcpEnabled } from "../mcp/actions";
import {
  UCAN_AUTH_EVENT,
  initWalletListeners,
  isValidUcanAuthorization,
  waitForWallet,
} from "../plugins/wallet";
import {
  getCentralUcanExpiresAt,
  isCentralModeEnabled,
} from "../plugins/central-ucan";
import { useToastStore } from "../store/toast";
import { useAutoSync } from "../hooks/useAutoSync";
import { notifyErrorWithOptions } from "../plugins/show_window";

const loadFunc = async () => {
  try {
    const provider = await initWalletListeners({ refresh: true });
    if (!provider) {
      throw new Error("❌未检测到钱包");
    }
    localStorage.setItem("hasConnectedWallet", "true");
  } catch (error) {
    console.error("钱包检测失败:", error);
    localStorage.setItem("hasConnectedWallet", "false");
    const loginMode = (getClientConfig()?.ucanLoginForceMode || "auto")
      .trim()
      .toLowerCase();
    if (loginMode === "wallet") {
      const innerHTML = `
        <p>❌ 未检测到钱包</p>
        <p class="error">请确保：</p>
        <ul>
          <li>•已安装 YeYing Wallet 扩展</li>
          <li>•已启用扩展</li>
          <li>•已在扩展设置中允许访问文件 URL（如果使用 file:// 协议）</li>
          <li>•刷新页面后重试</li>
        </ul>
      `;
      useToastStore.getState().setPendingError(innerHTML);
    } else {
      useToastStore.getState().setPendingError(null);
    }
  }
};

export function Loading(props: { noLogo?: boolean }) {
  useEffect(() => {
    // 确保 DOM 已加载（等价于 window.onload）
    if (typeof window !== "undefined") {
      loadFunc();
    }
  }, []);
  return (
    <div className={clsx("no-dark", styles["loading-content"])}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Artifacts = dynamic(async () => (await import("./artifacts")).Artifacts, {
  loading: () => <Loading noLogo />,
});

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});
const RouterPage = dynamic(
  async () => (await import("./router-page")).RouterPage,
  {
    loading: () => <Loading noLogo />,
  },
);
const StoragePage = dynamic(
  async () => (await import("./storage-page")).StoragePage,
  {
    loading: () => <Loading noLogo />,
  },
);
const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const NewChat = dynamic(async () => (await import("./new-chat")).NewChat, {
  loading: () => <Loading noLogo />,
});

const SkillPage = dynamic(async () => (await import("./mask")).SkillPage, {
  loading: () => <Loading noLogo />,
});

const PluginPage = dynamic(async () => (await import("./plugin")).PluginPage, {
  loading: () => <Loading noLogo />,
});

const SearchChat = dynamic(
  async () => (await import("./search-chat")).SearchChatPage,
  {
    loading: () => <Loading noLogo />,
  },
);

const Sd = dynamic(async () => (await import("./sd")).Sd, {
  loading: () => <Loading noLogo />,
});

const McpMarketPage = dynamic(
  async () => (await import("./mcp-market")).McpMarketPage,
  {
    loading: () => <Loading noLogo />,
  },
);

const DiscoveryPage = dynamic(
  async () => (await import("./discovery")).DiscoveryPage,
  {
    loading: () => <Loading noLogo />,
  },
);

export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

const loadAsyncGoogleFont = () => {
  const linkEl = document.createElement("link");
  const proxyFontUrl = "/google-fonts";
  const remoteFontUrl = "https://fonts.googleapis.com";
  const googleFontUrl =
    getClientConfig()?.buildMode === "export" ? remoteFontUrl : proxyFontUrl;
  linkEl.rel = "stylesheet";
  linkEl.href =
    googleFontUrl +
    "/css2?family=" +
    encodeURIComponent("Noto Sans:wght@300;400;700;900") +
    "&display=swap";
  document.head.appendChild(linkEl);
};

export function WindowContent(props: { children: React.ReactNode }) {
  return (
    <div className={styles["window-content"]} id={SlotID.AppBody}>
      {props?.children}
    </div>
  );
}

function Screen() {
  const config = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { authorized: isAuthorized, checking: isCheckingAuth } =
    useUcanAuthState();
  const isArtifact = location.pathname.includes(Path.Artifacts);
  const isHome = location.pathname === Path.Home;
  const isAuth = location.pathname === Path.Auth;
  const isSd = location.pathname === Path.Sd;
  const isSdNew = location.pathname === Path.SdNew;
  const isMobileScreen = useMobileScreen();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isCheckingAuth) return;

    const isAllowedPath = (pathname: string) =>
      pathname === Path.Auth || pathname.startsWith(Path.Artifacts);

    const resolveRedirectTarget = () => {
      const params = new URLSearchParams(location.search);
      const raw = params.get("redirect") || Path.Home;
      if (!raw.startsWith("/")) return Path.Home;
      if (raw === Path.Auth) return Path.Home;
      if (isMobileScreen && raw === Path.Chat) return Path.Home;
      return raw;
    };

    if (!isAuthorized && !isAllowedPath(location.pathname)) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`${Path.Auth}?redirect=${redirect}`, { replace: true });
      return;
    }

    if (isAuthorized && location.pathname === Path.Auth) {
      navigate(resolveRedirectTarget(), { replace: true });
    }
  }, [
    isAuthorized,
    isCheckingAuth,
    isMobileScreen,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !isAuthorized) return;
    let exp = 0;
    if (isCentralModeEnabled()) {
      exp = getCentralUcanExpiresAt() || 0;
    } else {
      const expRaw = localStorage.getItem("ucanRootExp");
      exp = Number(expRaw);
    }
    if (!Number.isFinite(exp) || exp <= Date.now()) return;
    const delay = Math.max(0, exp - Date.now());
    const expiryTimer = window.setTimeout(() => {
      window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
    }, delay + 200);
    return () => {
      window.clearTimeout(expiryTimer);
    };
  }, [isAuthorized]);

  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);

  useEffect(() => {
    loadAsyncGoogleFont();
  }, []);

  if (isArtifact) {
    return (
      <Routes>
        <Route path="/artifacts/:id" element={<Artifacts />} />
      </Routes>
    );
  }
  if (isCheckingAuth) {
    return <Loading noLogo />;
  }
  const renderContent = () => {
    if (isAuth) return <AuthPage />;
    if (!isAuthorized) return <AuthPage />;
    if (isSd) return <Sd />;
    if (isSdNew) return <Navigate to={Path.Sd} replace />;
    return (
      <>
        {isAuthorized ? <AuthenticatedBootstrap /> : null}
        <SideBar
          className={clsx({
            [styles["sidebar-show"]]: isHome,
          })}
        />
        <WindowContent>
          <div className={styles["page-content"]}>
            <Routes>
              <Route path={Path.Home} element={<Chat />} />
              <Route path={Path.NewChat} element={<NewChat />} />
              <Route path={Path.Skills} element={<SkillPage />} />
              <Route path={Path.Masks} element={<SkillPage />} />
              <Route path={Path.Plugins} element={<PluginPage />} />
              <Route path={Path.SearchChat} element={<SearchChat />} />
              <Route path={Path.Chat} element={<Chat />} />
              <Route path={Path.Settings} element={<Settings />} />
              <Route path={Path.Router} element={<RouterPage />} />
              <Route path={Path.Storage} element={<StoragePage />} />
              <Route path={Path.Discovery} element={<DiscoveryPage />} />
              <Route path={Path.McpMarket} element={<McpMarketPage />} />
            </Routes>
          </div>
        </WindowContent>
      </>
    );
  };

  return (
    <div
      className={clsx(styles.container, {
        [styles["container-full"]]: shouldTightBorder,
      })}
    >
      {renderContent()}
    </div>
  );
}

export function useLoadData() {
  const mergeModels = useAppConfig((state) => state.mergeModels);
  const setSkillProviderModels = useSkillProviderModelsStore(
    (state) => state.setModels,
  );
  const loadModels = useCallback(async () => {
    const api = getRouterClientApi();
    const [models, providerModels] = await Promise.all([
      api.llm.models(),
      api.llm.providerModels?.() ?? Promise.resolve([]),
    ]);
    mergeModels(models);
    setSkillProviderModels(providerModels);
  }, [mergeModels, setSkillProviderModels]);

  useEffect(() => {
    loadModels().catch((error) => {
      console.warn("[Models] initial load failed", error);
    });
  }, [loadModels]);

  useEffect(() => {
    const onAuthChange = () => {
      isValidUcanAuthorization()
        .then((valid) => {
          if (!valid) return;
          return loadModels();
        })
        .catch((error) => {
          console.warn("[Models] reload after auth failed", error);
        });
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    return () => window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
  }, [loadModels]);
}

function useUcanAuthState() {
  const [state, setState] = useState<{
    authorized: boolean;
    checking: boolean;
  }>({
    authorized: false,
    checking: true,
  });

  useEffect(() => {
    let cancelled = false;
    let refreshToken = 0;
    const refresh = async () => {
      const token = ++refreshToken;
      const authorized = await isValidUcanAuthorization();
      if (cancelled || token !== refreshToken) return;
      setState({
        authorized,
        checking: false,
      });
    };

    refresh();
    const onAuthChange = () => {
      refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
    };

    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return state;
}

function AuthenticatedBootstrap() {
  useLoadData();
  useAutoSync();

  useEffect(() => {
    useAccessStore.getState().fetch();

    const initMcp = async () => {
      try {
        const enabled = await isMcpEnabled();
        if (enabled) {
          await initializeMcpSystem();
        }
      } catch (err) {
        console.error("[MCP] failed to initialize:", err);
      }
    };
    initMcp();
  }, []);

  return null;
}

export function Home() {
  const pendingError = useToastStore((state) => state.pendingError);
  const clearError = useToastStore((state) => state.setPendingError);
  useSwitchTheme();
  useHtmlLang();

  useEffect(() => {
    if (pendingError) {
      notifyErrorWithOptions("钱包连接失败", {
        description: "请安装并启用 YeYing Wallet 扩展",
        duration: 8000,
        action: {
          label: "知道了",
          onClick: () => {
            waitForWallet();
          },
        },
      });

      clearError(null);
    }
  }, [pendingError, clearError]);

  if (!useHasHydrated()) {
    return <Loading />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Screen />
      </Router>
    </ErrorBoundary>
  );
}
