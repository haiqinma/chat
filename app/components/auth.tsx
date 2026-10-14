import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useCallback, useState, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import Delete from "../icons/close.svg";
import Logo from "../icons/yeying.svg";
import Wallet from "../icons/wallet.svg";
import ShortcutKey from "../icons/shortcutkey.svg";
import { useMobileScreen } from "@/app/utils";
import { getClientConfig } from "../config/client";
import { safeLocalStorage } from "@/app/utils";
import clsx from "clsx";
import {
  UCAN_AUTH_EVENT,
  isValidUcanAuthorization,
  requestWalletIdentityAuthorization,
  waitForWallet,
} from "../plugins/wallet";
import {
  approveCentralAuthorizePresentation,
  applyCentralAuthorizeExchange,
  consumeCentralAuthorizeSession,
  createCentralAuthorizeSession,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  exchangeCentralAuthorizeRequest,
  getCentralAuthorizeRequest,
  getCentralAuthorizeSession,
  getCentralAppId,
  getCentralIdentityOwner,
  resolveCentralAuthBaseUrl,
  setUcanAuthMode,
  UCAN_AUTH_MODE_CENTRAL,
} from "../plugins/central-ucan";
import { notifyError, notifySuccess } from "../plugins/show_window";
import { isDesktopAppRuntime } from "../tauri";
import { openUrl } from "@tauri-apps/plugin-opener";

const storage = safeLocalStorage();

const IDENTITY_LOGIN_SCOPES = [
  "identity.basic",
  "identity.wallet",
  "identity.username",
];
type LoginMode = "passkey" | "wallet";
type PasskeyLoginState = {
  loading: boolean;
  verifyUrl: string;
  message: string;
};

function normalizeRedirectPath(raw: string | null | undefined) {
  const value = (raw || "").trim();
  if (!value || !value.startsWith("/")) {
    return Path.Home;
  }
  if (value === Path.Auth) {
    return Path.Home;
  }
  return value;
}

function getCentralRedirectUri() {
  if (isDesktopAppRuntime()) return "";
  const configured = getClientConfig()?.centralUcanRedirectUri?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/central-ucan-callback.html`;
}

function formatCentralAuthError(error: unknown, redirectUri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return redirectUri ? `${message} (redirectUri: ${redirectUri})` : message;
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ucanStatus, setUcanStatus] = useState<
    "checking" | "authorized" | "expired" | "unauthorized"
  >("checking");
  const [centralLoading, setCentralLoading] = useState(false);
  // Web starts with wallet identity authorization; desktop builds use the
  // passkey flow because the wallet extension is not available there.
  const [loginMode, setLoginMode] = useState<LoginMode>(() =>
    getClientConfig()?.isApp ? "passkey" : "wallet",
  );
  const [passkeyLogin, setPasskeyLogin] = useState<PasskeyLoginState>({
    loading: false,
    verifyUrl: "",
    message: "",
  });
  const exchangedCodeRef = useRef("");
  const exchangingCodeRef = useRef("");
  const desktopAuthorizePollRef = useRef<number | null>(null);

  const stopDesktopAuthorizePolling = useCallback(() => {
    if (desktopAuthorizePollRef.current !== null) {
      window.clearTimeout(desktopAuthorizePollRef.current);
      desktopAuthorizePollRef.current = null;
    }
  }, []);

  const handleCentralCallback = useCallback(
    async (code: string, state: string | null | undefined) => {
      if (
        !code ||
        exchangedCodeRef.current === code ||
        exchangingCodeRef.current === code
      ) {
        return;
      }
      exchangingCodeRef.current = code;
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });

      const session = getCentralAuthorizeSession(state);
      const redirectPath = session
        ? normalizeRedirectPath(session.redirectPath)
        : normalizeRedirectPath(state);
      const redirectUri = getCentralRedirectUri();

      setCentralLoading(true);
      try {
        if (!session?.codeVerifier) {
          throw new Error("钱包身份授权会话已失效，请重新登录");
        }
        const result = await exchangeCentralAuthorizeCode({
          code,
          appId: getCentralAppId(),
          redirectUri,
          codeVerifier: session.codeVerifier,
        });
        exchangedCodeRef.current = code;
        consumeCentralAuthorizeSession(state);
        applyCentralAuthorizeExchange(result, { emit: false });
        notifySuccess(Locale.Auth.CentralLoginSuccess);
        navigate(redirectPath, { replace: true });
        window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
      } catch (error) {
        const message = Locale.Auth.CentralExchangeFailed(
          formatCentralAuthError(error, redirectUri),
        );
        notifyError(message);
      } finally {
        if (exchangingCodeRef.current === code) {
          exchangingCodeRef.current = "";
        }
        setCentralLoading(false);
      }
    },
    [navigate],
  );

  const startDesktopAuthorizePolling = useCallback(
    (requestId: string, state: string) => {
      stopDesktopAuthorizePolling();
      let attempts = 0;
      const poll = async () => {
        try {
          const request = await getCentralAuthorizeRequest(requestId);
          if (request.status === "approved") {
            const session = getCentralAuthorizeSession(state);
            if (!session?.codeVerifier) {
              throw new Error("钱包身份授权会话已失效，请重新登录");
            }
            setCentralLoading(true);
            const result = await exchangeCentralAuthorizeRequest({
              requestId,
              appId: getCentralAppId(),
              redirectUri: getCentralRedirectUri(),
              codeVerifier: session.codeVerifier,
            });
            consumeCentralAuthorizeSession(state);
            applyCentralAuthorizeExchange(result, { emit: false });
            notifySuccess(Locale.Auth.CentralLoginSuccess);
            navigate(normalizeRedirectPath(session.redirectPath), {
              replace: true,
            });
            window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
            stopDesktopAuthorizePolling();
            return;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const transient =
            message.includes("AUTHORIZATION_REQUEST_PENDING") ||
            message.includes("Failed to fetch") ||
            message.includes("Load failed") ||
            message.includes("网络");
          if (!transient) {
            stopDesktopAuthorizePolling();
            setCentralLoading(false);
            notifyError(Locale.Auth.CentralExchangeFailed(message));
            return;
          }
        } finally {
          setCentralLoading(false);
        }
        attempts += 1;
        if (attempts < 600) {
          desktopAuthorizePollRef.current = window.setTimeout(poll, 500);
        }
      };
      desktopAuthorizePollRef.current = window.setTimeout(poll, 500);
    },
    [navigate, stopDesktopAuthorizePolling],
  );

  useEffect(() => stopDesktopAuthorizePolling, [stopDesktopAuthorizePolling]);

  useEffect(() => {
    const config = getClientConfig();
    const params = new URLSearchParams(location.search);
    const hasCentralCallbackCode = Boolean((params.get("code") || "").trim());
    const hasCentralAuthConfig = Boolean(config?.chatApplicationUid?.trim());
    if (config?.isApp && !hasCentralCallbackCode && !hasCentralAuthConfig) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    let refreshToken = 0;
    const refreshStatus = async () => {
      const token = ++refreshToken;
      const owner = getCentralIdentityOwner().trim();
      const valid = await isValidUcanAuthorization();
      if (cancelled || token !== refreshToken) return;
      if (valid) {
        setUcanStatus("authorized");
      } else if (owner) {
        setUcanStatus("expired");
      } else {
        setUcanStatus("unauthorized");
      }
    };
    refreshStatus();
    const onAuthChange = () => {
      refreshStatus();
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      cancelled = true;
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = (params.get("code") || "").trim();
    if (!code) {
      return;
    }
    const state = params.get("state");
    void handleCentralCallback(code, state);
  }, [handleCentralCallback, location.search]);

  const startPasskeyLogin = useCallback(async () => {
    if (centralLoading) return;
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    setCentralLoading(true);
    setPasskeyLogin({ loading: true, verifyUrl: "", message: "" });
    try {
      const session = await createCentralAuthorizeSession(redirectPath);
      const request = await createCentralAuthorizeRequest({
        appId: getCentralAppId(),
        redirectUri,
        clientType: isDesktopAppRuntime() ? "desktop" : undefined,
        state: session.state,
        codeChallenge: session.codeChallenge,
        scopes: IDENTITY_LOGIN_SCOPES,
      });
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
      setPasskeyLogin({
        loading: false,
        verifyUrl: request.verifyUrl,
        message: "",
      });
      if (isDesktopAppRuntime()) {
        startDesktopAuthorizePolling(request.requestId, session.state);
      }
    } catch (error) {
      const message = Locale.Auth.CentralRequestFailed(
        formatCentralAuthError(error, redirectUri),
      );
      setPasskeyLogin({ loading: false, verifyUrl: "", message });
      notifyError(message);
    } finally {
      setCentralLoading(false);
    }
  }, [centralLoading, location.search, startDesktopAuthorizePolling]);

  useEffect(() => {
    if (
      loginMode !== "passkey" ||
      passkeyLogin.loading ||
      passkeyLogin.verifyUrl ||
      passkeyLogin.message
    ) {
      return;
    }
    void startPasskeyLogin();
  }, [loginMode, passkeyLogin, startPasskeyLogin]);

  const handleWalletIdentityLogin = async (
    provider: Awaited<ReturnType<typeof waitForWallet>>,
  ) => {
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    const session = await createCentralAuthorizeSession(redirectPath);
    setCentralLoading(true);
    try {
      const request = await createCentralAuthorizeRequest({
        appId: getCentralAppId(),
        redirectUri,
        clientType: isDesktopAppRuntime() ? "desktop" : undefined,
        state: session.state,
        codeChallenge: session.codeChallenge,
        scopes: IDENTITY_LOGIN_SCOPES,
      });
      const presentation = await requestWalletIdentityAuthorization({
        provider,
        request,
        issuerEndpoint: resolveCentralAuthBaseUrl(),
      });
      const approval = await approveCentralAuthorizePresentation({
        requestId: request.requestId,
        presentation,
      });
      const result = await exchangeCentralAuthorizeCode({
        code: approval.authorizationCode,
        appId: getCentralAppId(),
        redirectUri,
        codeVerifier: session.codeVerifier,
      });
      applyCentralAuthorizeExchange(result, { emit: false });
      notifySuccess(Locale.Auth.CentralLoginSuccess);
      navigate(redirectPath, { replace: true });
      window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
    } finally {
      consumeCentralAuthorizeSession(session.state);
      setCentralLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    if (centralLoading) return;
    let provider: Awaited<ReturnType<typeof waitForWallet>>;
    try {
      provider = await waitForWallet();
    } catch {
      notifyError(Locale.Auth.WalletUnavailable);
      return;
    }

    try {
      await handleWalletIdentityLogin(provider);
    } catch (error) {
      notifyError(
        Locale.Auth.WalletLoginFailed(
          formatCentralAuthError(error, getCentralRedirectUri()),
        ),
      );
    }
  };

  const isLoginDisabled = ucanStatus === "authorized" || centralLoading;
  const isDesktopApp = isDesktopAppRuntime();
  const isPasskeyMode = loginMode === "passkey";
  const openPasskeyVerification = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isDesktopAppRuntime()) return;
      event.preventDefault();
      const url = passkeyLogin.verifyUrl;
      if (!url) return;
      void openUrl(url).catch((error) => {
        console.error(
          "Failed to open passkey verification in system browser",
          error,
        );
        window.location.assign(url);
      });
    },
    [passkeyLogin.verifyUrl],
  );
  const toggleLoginMode = () => {
    setLoginMode(isPasskeyMode ? "wallet" : "passkey");
  };
  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <main
        className={styles["auth-card"]}
        data-runtime={isDesktopApp ? "desktop" : "web"}
        aria-labelledby="auth-title"
      >
        {!isDesktopApp ? (
          <button
            type="button"
            className={styles["auth-mode-corner"]}
            onClick={toggleLoginMode}
            title={
              isPasskeyMode
                ? Locale.Auth.SwitchToWalletLogin
                : Locale.Auth.SwitchToPasskeyLogin
            }
            aria-label={
              isPasskeyMode
                ? Locale.Auth.SwitchToWalletLogin
                : Locale.Auth.SwitchToPasskeyLogin
            }
          >
            {isPasskeyMode ? <Wallet /> : <ShortcutKey />}
          </button>
        ) : null}
        <div className={styles["auth-card-heading"]}>
          <h1 id="auth-title">
            {isPasskeyMode ? Locale.Auth.PasskeyTitle : Locale.Auth.WalletTitle}
          </h1>
          <p>
            {isPasskeyMode
              ? Locale.Auth.PasskeyDescription
              : Locale.Auth.WalletDescription}
          </p>
        </div>
        {isPasskeyMode ? (
          <div className={styles["auth-passkey-panel"]}>
            {passkeyLogin.verifyUrl ? (
              <QRCodeSVG
                className={styles["auth-passkey-qrcode"]}
                value={passkeyLogin.verifyUrl}
                size={220}
                level="M"
                includeMargin
              />
            ) : null}
            {passkeyLogin.loading ? (
              <p className={styles["auth-passkey-status"]}>
                {Locale.Auth.PasskeyPreparing}
              </p>
            ) : null}
            {passkeyLogin.message ? (
              <>
                <p className={styles["auth-passkey-status"]}>
                  {passkeyLogin.message}
                </p>
                <IconButton
                  text={Locale.Auth.PasskeyRefresh}
                  bordered
                  className={styles["auth-passkey-refresh"]}
                  onClick={startPasskeyLogin}
                />
              </>
            ) : null}
            {passkeyLogin.verifyUrl ? (
              <a
                className={styles["auth-passkey-open"]}
                href={passkeyLogin.verifyUrl}
                target="_blank"
                rel="noreferrer"
                onClick={openPasskeyVerification}
              >
                {Locale.Auth.PasskeyOpen}
              </a>
            ) : null}
          </div>
        ) : (
          <div className={styles["auth-wallet-panel"]}>
            <IconButton
              text={
                centralLoading
                  ? Locale.Auth.Processing
                  : Locale.Auth.WalletLogin
              }
              type="primary"
              className={styles["auth-login-action"]}
              onClick={handleWalletLogin}
              disabled={isLoginDisabled}
            />
            <p className={styles["auth-login-hint"]}>
              {Locale.Auth.WalletHint}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function TopBanner() {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    const bannerDismissed = storage.getItem("bannerDismissed");
    if (!bannerDismissed) {
      storage.setItem("bannerDismissed", "false");
      return true;
    }
    return bannerDismissed !== "true";
  });
  const isMobile = useMobileScreen();

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClose = () => {
    setIsVisible(false);
    storage.setItem("bannerDismissed", "true");
  };

  if (!isVisible) {
    return null;
  }
  return (
    <div
      className={styles["top-banner"]}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={clsx(styles["top-banner-inner"], "no-dark")}>
        <Logo className={styles["top-banner-logo"]}></Logo>
        <span>{Locale.Auth.TopTips}</span>
      </div>
      {(isHovered || isMobile) && (
        <Delete className={styles["top-banner-close"]} onClick={handleClose} />
      )}
    </div>
  );
}
