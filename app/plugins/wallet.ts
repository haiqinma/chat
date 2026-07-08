import { notifyError, notifyInfo, notifySuccess } from "./show_window";
import {
  acquireUcanSignLock,
  isUcanSignPendingError,
  refreshUcanSignLock,
  releaseUcanSignLock,
} from "./ucan-sign-lock";
import {
  focusPendingApproval,
  getProvider,
  resolveWalletAccount,
  getChainId as getChainIdFromSdk,
  getBalance as getBalanceFromSdk,
  watchProvider,
  watchAccounts,
  onChainChanged,
  classifyWalletError,
  createRootUcan,
  getStoredUcanRoot,
  resolveUcanAuthorization,
  clearUcanSession,
  type Eip1193Provider,
  type UcanRootProof,
  type WalletAccountResolution as SdkWalletAccountResolution,
} from "@yeying-community/web3-bs";
import {
  UCAN_SESSION_ID,
  buildUcanRootStatement,
  getRouterServiceHost,
  getUcanCapsKey,
  getUcanRootCapabilities,
  getUcanRootCapsKey,
  getWebdavServiceHost,
} from "./ucan";
import { clearCachedUcanSession, ensureLocalUcanSession } from "./ucan-session";
import {
  clearCentralUcanAuth,
  isCentralModeEnabled,
  isCentralUcanAuthorized,
  setUcanAuthMode,
  UCAN_AUTH_MODE_WALLET,
} from "./central-ucan";

const providerOptions = {
  preferYeYing: true,
  timeoutMs: 5000,
};

export const UCAN_AUTH_EVENT = "ucan-auth-change";
export const UCAN_AUTH_ERROR_EVENT = "ucan-auth-error";

let authTransitionDepth = 0;

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
}

function beginAuthTransition() {
  authTransitionDepth += 1;
  emitAuthChange();
}

function endAuthTransition() {
  authTransitionDepth = Math.max(0, authTransitionDepth - 1);
  emitAuthChange();
}

export function isUcanAuthTransitioning() {
  return authTransitionDepth > 0;
}

export async function invalidateUcanAuthorization(reason?: string) {
  try {
    await clearUcanSession(UCAN_SESSION_ID);
  } catch (error) {
    console.warn("[UCAN] failed to clear session", error);
  }
  clearUcanMeta();
  clearCachedUcanSession();
  emitAuthError(reason);
  emitAuthChange();
}

function emitAuthError(detail?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UCAN_AUTH_ERROR_EVENT, { detail: detail ?? "" }),
  );
}

let currentProvider: Eip1193Provider | null = null;
let providerWatcherCleanup: (() => void) | null = null;
let listenersCleanup: (() => void) | null = null;
let listenersReady = false;
let loginInFlight = false;
let logoutInFlight = false;

export type WalletLoginAccountResolution =
  | {
      status: "pending";
      provider: Eip1193Provider;
      account: null;
      walletAccount: null;
      expectedAccount: string | null;
      accounts: string[];
    }
  | (SdkWalletAccountResolution & {
      provider: Eip1193Provider;
    });

function getUcanIssuer(address: string) {
  return `did:pkh:eth:${address.toLowerCase()}`;
}

function normalizeAccount(account?: string | null) {
  const normalized = (account || "").trim();
  return normalized || null;
}

export function isUcanMetaAuthorized(): boolean {
  if (isCentralModeEnabled()) {
    return isCentralUcanAuthorized();
  }
  try {
    if (typeof localStorage === "undefined") return false;
    const account = getCurrentAccount();
    if (!account) return false;
    const expRaw = localStorage.getItem("ucanRootExp");
    const iss = localStorage.getItem("ucanRootIss");
    const caps = localStorage.getItem("ucanRootCaps");
    if (!expRaw || !iss || !caps) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    if (caps !== getUcanRootCapsKey()) return false;
    return iss === getUcanIssuer(account);
  } catch {
    return false;
  }
}

async function resolveWalletUcanAuthorization(options?: {
  root?: UcanRootProof | null;
  account?: string | null;
  recoverAccountFromRoot?: boolean;
}) {
  return await resolveUcanAuthorization({
    sessionId: UCAN_SESSION_ID,
    root: options?.root,
    currentAccount: options?.account ?? getCurrentAccount(),
    expectedCapabilities: getUcanRootCapabilities(),
    expectedServiceHosts: {
      router: getRouterServiceHost(),
      webdav: getWebdavServiceHost(),
    },
    recoverAccountFromRoot: options?.recoverAccountFromRoot,
  });
}

function storeUcanMeta(root: UcanRootProof) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("ucanRootExp", String(root.exp));
  localStorage.setItem("ucanRootIss", root.iss);
  localStorage.setItem("ucanRootCaps", getUcanCapsKey(root.cap));
}

function clearUcanMeta() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("ucanRootExp");
  localStorage.removeItem("ucanRootIss");
  localStorage.removeItem("ucanRootCaps");
}

async function getStoredRoot(): Promise<UcanRootProof | null> {
  return await getStoredUcanRoot(UCAN_SESSION_ID);
}

async function resolveProvider(options?: {
  refresh?: boolean;
}): Promise<Eip1193Provider | null> {
  if (!options?.refresh && currentProvider) {
    return currentProvider;
  }
  const provider = await getProvider(providerOptions);
  currentProvider = provider;
  return provider;
}

async function requireProvider(): Promise<Eip1193Provider> {
  const provider = await resolveProvider({ refresh: true });
  if (!provider) {
    throw new Error("未检测到钱包");
  }
  return provider;
}

function clearWalletAuthState(options?: { clearAccount?: boolean }) {
  if (options?.clearAccount) {
    localStorage.removeItem("currentAccount");
  }
  localStorage.removeItem("authToken");
  clearUcanMeta();
  clearCachedUcanSession();
}

async function focusPendingWalletApproval(
  provider?: Eip1193Provider | null,
): Promise<boolean> {
  try {
    const providerInstance =
      provider || (await resolveProvider({ refresh: true }));
    if (!providerInstance) return false;
    const result = await focusPendingApproval(providerInstance);
    return Boolean(result?.focused);
  } catch (error) {
    return false;
  }
}

function bindWalletListeners(provider: Eip1193Provider) {
  listenersCleanup?.();
  let lastObservedAccount = getCurrentAccount();
  const handleAccountsChanged = async (accounts: string[]) => {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      if (logoutInFlight) {
        logoutInFlight = false;
        return;
      }
      const root = await getStoredRoot();
      const current = getCurrentAccount();
      const expectedIssuer = current ? getUcanIssuer(current) : "";
      const auth = await resolveWalletUcanAuthorization({
        root,
        account: current || null,
        recoverAccountFromRoot: !expectedIssuer,
      });
      const rootValid = auth.status === "authorized";

      if (rootValid) {
        // 钱包可能只是锁定，保留已授权的 UCAN
        return;
      }

      await clearUcanSession(UCAN_SESSION_ID);
      clearWalletAuthState({ clearAccount: true });
      lastObservedAccount = "";
      emitAuthChange();
      return;
    }

    const nextAccount = accounts[0];
    if (nextAccount !== lastObservedAccount) {
      const previousAccount = lastObservedAccount;
      lastObservedAccount = nextAccount;
      if (!previousAccount || loginInFlight) {
        localStorage.setItem("currentAccount", nextAccount);
        emitAuthChange();
        return;
      }
      localStorage.setItem("currentAccount", nextAccount);
      beginAuthTransition();
      try {
        await clearUcanSession(UCAN_SESSION_ID);
        clearWalletAuthState();
        await loginWithUcan(provider, nextAccount, {
          silent: true,
          reload: false,
        });
        const reauthorized = await isValidUcanAuthorization();
        if (!reauthorized) {
          throw new Error("silent reauth did not restore UCAN authorization");
        }
      } catch (error) {
        console.warn("[Wallet] silent reauth after account change failed", {
          previousAccount,
          nextAccount,
          error,
        });
        if (loginInFlight) {
          localStorage.setItem("currentAccount", nextAccount);
        } else {
          clearWalletAuthState({ clearAccount: true });
          lastObservedAccount = "";
        }
        emitAuthChange();
      } finally {
        endAuthTransition();
      }
    }
  };

  const handleChainChanged = (chainId: string) => {
    console.info(`[Wallet] 已切换网络: ${chainId}`);
  };

  const offAccounts = watchAccounts(
    provider,
    ({ account, accounts }) => {
      handleAccountsChanged(
        account
          ? [account, ...accounts.filter((item) => item !== account)]
          : accounts,
      );
    },
    {
      storageKey: "currentAccount",
    },
  );
  const offChain = onChainChanged(provider, handleChainChanged);

  listenersCleanup = () => {
    offAccounts?.();
    offChain?.();
    listenersCleanup = null;
    listenersReady = false;
  };
  listenersReady = true;
  return listenersCleanup;
}

export async function initWalletListeners(options?: { refresh?: boolean }) {
  if (!providerWatcherCleanup) {
    providerWatcherCleanup = watchProvider(({ provider }) => {
      currentProvider = provider;
      if (!provider) {
        listenersCleanup?.();
        localStorage.setItem("hasConnectedWallet", "false");
        emitAuthChange();
        return;
      }

      localStorage.setItem("hasConnectedWallet", "true");
      bindWalletListeners(provider);
      emitAuthChange();
    }, providerOptions);
  }

  const provider = await resolveProvider({
    refresh: options?.refresh ?? false,
  });
  if (!provider) {
    return null;
  }
  return bindWalletListeners(provider);
}

// 等待钱包注入
export async function waitForWallet() {
  const provider = await resolveProvider({ refresh: true });
  if (!provider) {
    throw new Error("未检测到钱包");
  }
  return provider;
}

export async function resolveWalletLoginAccount(
  preferredAccount?: string | null,
): Promise<WalletLoginAccountResolution> {
  const provider = await requireProvider();
  const focused = await focusPendingWalletApproval(provider);
  if (focused) {
    return {
      status: "pending",
      provider,
      account: null,
      walletAccount: null,
      expectedAccount: normalizeAccount(preferredAccount),
      accounts: [],
    };
  }
  const resolution = await resolveWalletAccount({
    provider,
    expectedAccount: normalizeAccount(preferredAccount),
    autoConnect: true,
  });

  return {
    provider,
    ...resolution,
  };
}

// 连接钱包
export async function connectWallet(preferredAccount?: string) {
  try {
    try {
      const resolution = await resolveWalletLoginAccount(preferredAccount);
      if (resolution.status === "pending") {
        return;
      }
      if (resolution.status === "unavailable") {
        if (resolution.accounts.length === 0) {
          notifyError("未获取到账户");
        }
        return;
      }
      if (resolution.status === "mismatch") {
        notifyInfo("检测到账户不一致，请前往登录页选择登录地址");
        return;
      }
      const currentAccount = resolution.account;
      if (currentAccount) {
        localStorage.setItem("currentAccount", currentAccount);
        setUcanAuthMode(UCAN_AUTH_MODE_WALLET, { emit: false });
        clearCentralUcanAuth({ preserveMode: true, emit: false });
        await loginWithUcan(resolution.provider, currentAccount, {
          silent: false,
          reload: false,
        });
      }
    } catch (error) {
      // 类型守卫：判断是否为具有 message 和 code 的 Error 对象
      if (error && typeof error === "object" && "message" in error) {
        const err = error as {
          message?: string;
          code?: number;
          [key: string]: any;
        };
        console.log(`error.message=${err.message}`);
        if (
          typeof err.message === "string" &&
          err.message.includes("Session expired")
        ) {
          notifyError(
            `会话已过期，请打开钱包插件输入密码激活钱包状态 ${error}`,
          );
        } else if (classifyWalletError(error).type === "userRejected") {
          notifyError(`用户拒绝了连接请求 ${error}`);
        } else if (classifyWalletError(error).type === "notFound") {
          notifyError("未检测到钱包，请先安装并连接钱包");
        } else if (classifyWalletError(error).type === "disconnected") {
          notifyError("钱包连接已断开，请稍后重试或刷新钱包扩展");
        } else {
          console.error("未知连接错误:", error);
          notifyError(`连接失败，请检查钱包状态 ${error}`);
        }
      } else {
        // 处理非标准错误（比如字符串或 null）
        console.error("非预期的错误类型:", error);
        notifyError(`连接失败，发生未知错误 ${error}`);
      }
      return;
    }
  } catch (error) {
    console.error("连接失败:", error);
    notifyError(`连接失败: ${error}`);
  }
}

export function getCurrentAccount() {
  let account = localStorage.getItem("currentAccount");
  if (account === undefined || account === null) {
    account = "";
  }
  return account;
}

// 获取链 ID
export async function getChainId() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("未检测到钱包，请先安装并连接钱包");
    return;
  }
  try {
    const provider = await requireProvider();
    const chainId = await getChainIdFromSdk(provider);

    if (!chainId) {
      notifyError("获取链 ID 失败");
      return;
    }

    const chainNames = {
      "0x1": "Ethereum Mainnet",
      "0xaa36a7": "Sepolia Testnet",
      "0x5": "Goerli Testnet",
      "0x1538": "YeYing Network",
    };

    const chainName =
      chainNames[chainId as keyof typeof chainNames] || "未知网络";
    return `链 ID: ${chainId}\n网络: ${chainName}`;
  } catch (error) {
    console.error("获取链 ID 失败:", error);
    notifyError(`获取链 ID 失败: ${error}`);
  }
}

// 获取余额
export async function getBalance() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("未检测到钱包，请先安装并连接钱包");
    return;
  }
  const currentAccount = getCurrentAccount();
  if (!currentAccount) {
    notifyError("请先连接钱包");
    return;
  }
  try {
    const provider = await requireProvider();
    const balance = await getBalanceFromSdk(provider, currentAccount, "latest");

    // 转换为 ETH
    const ethBalance = parseInt(balance, 16) / 1e18;
    return `余额: ${ethBalance.toFixed(6)} ETH\n原始值: ${balance}`;
  } catch (error) {
    console.error("获取余额失败:", error);
    notifyError(`获取余额失败: ${error}`);
  }
}

// UCAN 授权
export async function loginWithUcan(
  provider?: Eip1193Provider,
  address?: string,
  options?: { silent?: boolean; reload?: boolean },
) {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("未检测到钱包，请先安装并连接钱包");
    return;
  }
  if (loginInFlight) {
    await focusPendingWalletApproval(provider || currentProvider);
    return;
  }
  loginInFlight = true;
  try {
    const providerInstance = provider || (await requireProvider());
    setUcanAuthMode(UCAN_AUTH_MODE_WALLET, { emit: false });
    clearCentralUcanAuth({ preserveMode: true, emit: false });
    const currentAccount = address || getCurrentAccount();
    if (!currentAccount) {
      notifyError("请先连接钱包");
      return;
    }

    const existing = await getStoredRoot();
    const existingAuth = existing
      ? await resolveWalletUcanAuthorization({
          root: existing,
          account: currentAccount,
        })
      : null;
    if (existingAuth?.status === "authorized") {
      localStorage.setItem("currentAccount", currentAccount);
      storeUcanMeta(existingAuth.root);
      emitAuthError("");
      emitAuthChange();
      if (options?.reload) {
        window.location.reload();
      }
      return;
    }
    if (existing) {
      await clearUcanSession(UCAN_SESSION_ID);
      clearUcanMeta();
      clearCachedUcanSession();
    }

    if (!acquireUcanSignLock()) {
      const focused = await focusPendingWalletApproval(providerInstance);
      if (!options?.silent && !focused) {
        notifyInfo("钱包签名处理中，请在钱包完成确认");
      }
      return;
    }

    const rootCapabilities = getUcanRootCapabilities();
    const session = await ensureLocalUcanSession();
    if (!session) {
      throw new Error("UCAN session is not available");
    }
    const rootStatement = buildUcanRootStatement({
      audience: session.did,
      capabilities: rootCapabilities,
    });
    const root = await createRootUcan({
      provider: providerInstance,
      address: currentAccount,
      sessionId: UCAN_SESSION_ID,
      session,
      capabilities: rootCapabilities,
      statement: rootStatement,
    });
    const storedRoot = await getStoredRoot();
    if (
      !storedRoot ||
      (
        await resolveWalletUcanAuthorization({
          root: storedRoot,
          account: currentAccount,
        })
      ).status !== "authorized" ||
      storedRoot.aud !== root.aud
    ) {
      throw new Error("UCAN root was not persisted");
    }
    storeUcanMeta(storedRoot);
    localStorage.setItem("currentAccount", currentAccount);
    localStorage.removeItem("authToken");
    emitAuthError("");
    emitAuthChange();
    if (options?.reload) {
      window.location.reload();
    }
    releaseUcanSignLock();
  } catch (error) {
    if (isUcanSignPendingError(error)) {
      refreshUcanSignLock();
      if (!options?.silent) {
        notifyInfo("钱包签名处理中，请在钱包完成确认");
      }
      return;
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: string }).message === "string" &&
      (error as { message?: string }).message?.includes("Request timeout")
    ) {
      emitAuthError("Request timeout");
    }
    console.error("授权失败:", error);
    if (!options?.silent) {
      notifyError(`授权失败: ${error}`);
    }
    releaseUcanSignLock();
  } finally {
    loginInFlight = false;
  }
}

export async function logoutWallet() {
  logoutInFlight = true;
  setTimeout(() => {
    logoutInFlight = false;
  }, 2000);
  localStorage.removeItem("currentAccount");
  localStorage.removeItem("authToken");
  try {
    await clearUcanSession(UCAN_SESSION_ID);
  } catch (error) {
    console.warn("[UCAN] failed to clear session on logout", error);
  }
  clearUcanMeta();
  clearCachedUcanSession();
  clearCentralUcanAuth({ emit: false });
  emitAuthChange();
  notifySuccess("已退出");
}

/**
 * 检查 token 是否有效
 * @param token
 * @returns
 */
export async function isValidUcanAuthorization(): Promise<boolean> {
  if (isCentralModeEnabled()) {
    return isCentralUcanAuthorized();
  }
  try {
    const root = await getStoredRoot();
    const auth = await resolveWalletUcanAuthorization({
      root,
      recoverAccountFromRoot: true,
    });
    if (auth.status === "authorized") {
      if (auth.restoredAccount && !getCurrentAccount()) {
        localStorage.setItem("currentAccount", auth.account);
        storeUcanMeta(auth.root);
        console.info("[Wallet] restored current account from UCAN root");
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
