import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect, useRef, type FocusEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import ClearIcon from "../icons/close.svg";
import Delete from "../icons/close.svg";
import Logo from "../icons/yeying.svg";
import { useMobileScreen } from "@/app/utils";
import { getClientConfig } from "../config/client";
import { safeLocalStorage } from "@/app/utils";
import clsx from "clsx";
import {
  UCAN_AUTH_EVENT,
  getCurrentAccount,
  isValidUcanAuthorization,
  loginWithUcan,
  resolveWalletLoginAccount,
  waitForWallet,
} from "../plugins/wallet";
import {
  applyCentralAuthorizeExchange,
  consumeCentralAuthorizeSession,
  createCentralAuthorizeSession,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getCentralAppId,
  setUcanAuthMode,
  UCAN_AUTH_MODE_CENTRAL,
  UCAN_AUTH_MODE_WALLET,
} from "../plugins/central-ucan";
import { notifyError, notifyInfo, notifySuccess } from "../plugins/show_window";
import { showModal } from "./ui-lib";

const storage = safeLocalStorage();
const WALLET_HISTORY_KEY = "walletAccountHistory";
const WALLET_HISTORY_LIMIT = 10;
type UcanLoginForceMode = "auto" | "wallet" | "central";

function normalizeAccount(account?: string | null) {
  return (account ?? "").trim();
}

function formatAccountPreview(account?: string | null) {
  const normalized = normalizeAccount(account);
  if (!normalized) return "";
  const prefixLength = 6;
  const suffixLength = 6;
  if (normalized.length <= prefixLength + suffixLength + 3) {
    return normalized;
  }
  return `${normalized.slice(0, prefixLength)}...${normalized.slice(-suffixLength)}`;
}

function parseWalletHistory(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeAccount(item))
      .filter((item) => {
        if (!item) return false;
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, WALLET_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function loadWalletHistory() {
  return parseWalletHistory(storage.getItem(WALLET_HISTORY_KEY));
}

function persistWalletHistory(history: string[]) {
  storage.setItem(WALLET_HISTORY_KEY, JSON.stringify(history));
}

function mergeWalletHistory(account: string, history: string[]) {
  if (!account) return history;
  return [
    account,
    ...history.filter((item) => item.toLowerCase() !== account.toLowerCase()),
  ].slice(0, WALLET_HISTORY_LIMIT);
}

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
  const configured = getClientConfig()?.centralUcanRedirectUri?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/central-ucan-callback.html`;
}

function formatCentralAuthError(error: unknown, redirectUri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return redirectUri ? `${message} (redirectUri: ${redirectUri})` : message;
}

function getUcanLoginForceMode(): UcanLoginForceMode {
  const mode = (getClientConfig()?.ucanLoginForceMode || "")
    .trim()
    .toLowerCase();
  if (mode === "wallet" || mode === "central") {
    return mode;
  }
  return "auto";
}

function renderWalletMismatchPrompt(
  expectedAccount: string,
  walletAccount: string,
) {
  return (
    <div>
      <div>{Locale.Auth.WalletMismatch.Description}</div>
      <div style={{ marginTop: 12 }}>
        {Locale.Auth.WalletMismatch.App}: <code>{expectedAccount}</code>
      </div>
      <div style={{ marginTop: 8 }}>
        {Locale.Auth.WalletMismatch.Wallet}: <code>{walletAccount}</code>
      </div>
    </div>
  );
}

function showWalletMismatchDecision(
  expectedAccount: string,
  walletAccount: string,
) {
  return new Promise<"wallet" | "switch" | "cancel">((resolve) => {
    let settled = false;
    const finish = (decision: "wallet" | "switch" | "cancel") => {
      if (settled) return;
      settled = true;
      resolve(decision);
    };
    const closeModal = showModal({
      title: Locale.Auth.WalletMismatch.Title,
      actions: [
        <IconButton
          key="cancel"
          text={Locale.UI.Cancel}
          onClick={() => {
            finish("cancel");
            void closeModal();
          }}
          bordered
          shadow
        />,
        <IconButton
          key="switch"
          text={Locale.Auth.WalletMismatch.Switch}
          onClick={() => {
            finish("switch");
            void closeModal();
          }}
          bordered
          shadow
        />,
        <IconButton
          key="wallet"
          text={Locale.Auth.WalletMismatch.UseWallet}
          type="primary"
          onClick={() => {
            finish("wallet");
            void closeModal();
          }}
          bordered
          shadow
        />,
      ],
      onClose: () => {
        finish("cancel");
      },
      children: renderWalletMismatchPrompt(expectedAccount, walletAccount),
    });
  });
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ucanStatus, setUcanStatus] = useState<
    "checking" | "authorized" | "expired" | "unauthorized"
  >("checking");
  const [walletHistory, setWalletHistory] = useState<string[]>([]);
  const [selectedWalletAccount, setSelectedWalletAccount] = useState("");
  const [hasSelectedWalletAccount, setHasSelectedWalletAccount] =
    useState(false);
  const [isWalletAccountFocused, setIsWalletAccountFocused] = useState(false);
  const [isWalletHistoryOpen, setIsWalletHistoryOpen] = useState(false);
  const [centralLoading, setCentralLoading] = useState(false);
  const exchangedCodeRef = useRef("");
  const walletAccountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const config = getClientConfig();
    const params = new URLSearchParams(location.search);
    const hasCentralCallbackCode = Boolean((params.get("code") || "").trim());
    const hasCentralAuthConfig = Boolean(config?.centralUcanAppId?.trim());
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
      const account = normalizeAccount(getCurrentAccount());
      const history = mergeWalletHistory(account, loadWalletHistory());
      const valid = await isValidUcanAuthorization();
      if (cancelled || token !== refreshToken) return;
      if (history.length > 0) {
        persistWalletHistory(history);
      }
      setWalletHistory(history);
      if (valid) {
        setUcanStatus("authorized");
      } else if (account) {
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
    if (exchangedCodeRef.current === code) {
      return;
    }
    exchangedCodeRef.current = code;
    setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });

    const state = params.get("state");
    const session = consumeCentralAuthorizeSession(state);
    const redirectPath = session
      ? normalizeRedirectPath(session.redirectPath)
      : normalizeRedirectPath(state);
    const redirectUri = getCentralRedirectUri();

    const run = async () => {
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
        applyCentralAuthorizeExchange(result, { emit: false });
        notifySuccess(Locale.Auth.CentralLoginSuccess);
        const target = encodeURIComponent(redirectPath);
        navigate(`${Path.Auth}?redirect=${target}`, { replace: true });
        window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
      } catch (error) {
        const message = Locale.Auth.CentralExchangeFailed(
          formatCentralAuthError(error, redirectUri),
        );
        notifyError(message);
      } finally {
        setCentralLoading(false);
      }
    };

    run();
  }, [location.search, navigate]);

  const handleCentralAuthorizeLogin = async () => {
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    setCentralLoading(true);
    try {
      const session = await createCentralAuthorizeSession(redirectPath);
      const request = await createCentralAuthorizeRequest({
        appId: getCentralAppId(),
        redirectUri,
        state: session.state,
        codeChallenge: session.codeChallenge,
        scopes: ["identity.basic", "identity.wallet", "identity.username"],
      });
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
      notifySuccess(Locale.Auth.CentralRequestCreated);
      window.location.href = request.verifyUrl;
    } catch (error) {
      notifyError(
        Locale.Auth.CentralRequestFailed(
          formatCentralAuthError(error, redirectUri),
        ),
      );
    } finally {
      setCentralLoading(false);
    }
  };

  const handlePrimaryLogin = async () => {
    if (centralLoading) return;
    const preferredAddress = hasSelectedWalletAccount
      ? normalizeAccount(selectedWalletAccount)
      : "";
    const forceMode = getUcanLoginForceMode();

    if (forceMode === "central") {
      await handleCentralAuthorizeLogin();
      return;
    }

    try {
      await waitForWallet();
      setUcanAuthMode(UCAN_AUTH_MODE_WALLET, { emit: false });
      const resolution = await resolveWalletLoginAccount(
        preferredAddress || undefined,
      );

      if (resolution.status === "pending") {
        return;
      }

      if (resolution.status === "unavailable") {
        notifyError(Locale.Auth.MissingWalletAccount);
        return;
      }

      if (resolution.status === "mismatch") {
        const decision = await showWalletMismatchDecision(
          resolution.expectedAccount,
          resolution.walletAccount,
        );

        if (decision === "switch") {
          setSelectedWalletAccount(resolution.expectedAccount);
          notifyInfo(Locale.Auth.SwitchToAppAccount);
          return;
        }

        if (decision !== "wallet") {
          notifyInfo(Locale.Auth.LoginCancelled);
          return;
        }
        setSelectedWalletAccount(resolution.walletAccount);
        setHasSelectedWalletAccount(true);
        storage.setItem("currentAccount", resolution.walletAccount);
        await loginWithUcan(resolution.provider, resolution.walletAccount, {
          silent: false,
          reload: false,
        });
        return;
      }

      storage.setItem("currentAccount", resolution.account);
      setSelectedWalletAccount(resolution.account);
      setHasSelectedWalletAccount(true);
      await loginWithUcan(resolution.provider, resolution.account, {
        silent: false,
        reload: false,
      });
      return;
    } catch (error) {
      if (forceMode === "wallet") {
        notifyError(Locale.Auth.WalletLoginFailed(String(error)));
        return;
      }
      // wallet not available, fallback to centralized UCAN service
    }

    await handleCentralAuthorizeLogin();
  };

  const handleWalletSelectWrapBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocused = event.relatedTarget as Node | null;
    if (nextFocused && event.currentTarget.contains(nextFocused)) {
      return;
    }
    setIsWalletHistoryOpen(false);
    setIsWalletAccountFocused(false);
    setSelectedWalletAccount((value) => {
      const normalized = normalizeAccount(value);
      setHasSelectedWalletAccount(normalized.length > 0);
      return normalized;
    });
  };

  const handleWalletHistoryToggle = () => {
    const nextOpen = !isWalletHistoryOpen;
    setIsWalletHistoryOpen(nextOpen);
    if (nextOpen) {
      setIsWalletAccountFocused(true);
      walletAccountInputRef.current?.focus();
    } else {
      walletAccountInputRef.current?.blur();
    }
  };

  const handleWalletHistorySelect = (account: string) => {
    setSelectedWalletAccount(account);
    setHasSelectedWalletAccount(true);
    setIsWalletHistoryOpen(false);
    setIsWalletAccountFocused(false);
    walletAccountInputRef.current?.blur();
  };

  const handleWalletAccountClear = () => {
    setSelectedWalletAccount("");
    setHasSelectedWalletAccount(false);
    setIsWalletHistoryOpen(false);
    walletAccountInputRef.current?.focus();
  };

  const isWalletConnectDisabled = ucanStatus === "authorized" || centralLoading;
  const normalizedSelectedWalletAccount = normalizeAccount(
    selectedWalletAccount,
  );
  const walletAccountInputValue = isWalletAccountFocused
    ? selectedWalletAccount
    : formatAccountPreview(
        hasSelectedWalletAccount ? selectedWalletAccount : "",
      );

  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div className={styles["auth-wallet"]}>
        <div
          className={styles["auth-wallet-select-wrap"]}
          onBlur={handleWalletSelectWrapBlur}
        >
          <input
            ref={walletAccountInputRef}
            className={styles["auth-wallet-select"]}
            value={walletAccountInputValue}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedWalletAccount(value);
              setHasSelectedWalletAccount(normalizeAccount(value).length > 0);
              setIsWalletHistoryOpen(true);
            }}
            onFocus={() => {
              setIsWalletAccountFocused(true);
              setIsWalletHistoryOpen(true);
            }}
            data-empty={hasSelectedWalletAccount ? "false" : "true"}
            aria-label={Locale.Auth.Input}
            placeholder={Locale.Auth.Input}
            autoComplete="off"
            spellCheck={false}
            title={hasSelectedWalletAccount ? selectedWalletAccount : ""}
          />
          {hasSelectedWalletAccount && (
            <button
              type="button"
              className={styles["auth-wallet-clear"]}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleWalletAccountClear}
              title={Locale.Auth.ClearSelection}
              aria-label={Locale.Auth.ClearSelection}
            >
              <ClearIcon />
            </button>
          )}
          {isWalletHistoryOpen && (
            <div className={styles["auth-wallet-history-menu"]}>
              {walletHistory.length > 0 ? (
                walletHistory.map((account) => (
                  <button
                    key={account}
                    type="button"
                    className={styles["auth-wallet-history-option"]}
                    data-active={
                      account.toLowerCase() ===
                      normalizedSelectedWalletAccount.toLowerCase()
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleWalletHistorySelect(account)}
                    title={account}
                  >
                    {formatAccountPreview(account)}
                  </button>
                ))
              ) : (
                <div className={styles["auth-wallet-history-empty"]}>
                  {Locale.Auth.EmptyHistory}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={styles["auth-wallet-arrow-button"]}
            onClick={handleWalletHistoryToggle}
            aria-label={Locale.Auth.ExpandAccountList}
            title={Locale.Auth.ExpandAccountList}
          >
            <span
              className={styles["auth-wallet-select-arrow"]}
              data-open={isWalletHistoryOpen ? "true" : "false"}
            />
          </button>
        </div>
        <IconButton
          text={centralLoading ? Locale.Auth.Processing : Locale.Auth.Confirm}
          type="primary"
          className={styles["auth-wallet-connect"]}
          onClick={handlePrimaryLogin}
          disabled={isWalletConnectDisabled}
        />
      </div>
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
