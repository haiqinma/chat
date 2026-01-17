import { notifyError, notifyInfo, notifySuccess } from "./show_window";
import {
  getProvider,
  requestAccounts,
  getChainId as getChainIdFromSdk,
  getBalance as getBalanceFromSdk,
  onAccountsChanged,
  onChainChanged,
  createRootUcan,
  getStoredUcanRoot,
  clearUcanSession,
  type Eip1193Provider,
  type UcanRootProof,
} from "@yeying-community/web3-bs";
import { UCAN_SESSION_ID, getUcanRootCapabilities } from "./ucan";

const providerOptions = {
  preferYeYing: true,
  timeoutMs: 5000,
};

let providerPromise: Promise<Eip1193Provider | null> | null = null;
let listenersCleanup: (() => void) | null = null;
let listenersReady = false;
let loginInFlight = false;

function getUcanIssuer(address: string) {
  return `did:pkh:eth:${address.toLowerCase()}`;
}

async function getStoredRoot(): Promise<UcanRootProof | null> {
  return await getStoredUcanRoot(UCAN_SESSION_ID);
}

async function resolveProvider(): Promise<Eip1193Provider | null> {
  if (!providerPromise) {
    providerPromise = getProvider(providerOptions);
  }
  const provider = await providerPromise;
  if (!provider) {
    providerPromise = null;
  }
  return provider;
}

async function requireProvider(): Promise<Eip1193Provider> {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error("❌未检测到钱包");
  }
  return provider;
}

export async function initWalletListeners() {
  if (listenersReady) {
    return listenersCleanup;
  }
  const provider = await resolveProvider();
  if (!provider) {
    return null;
  }

  const handleAccountsChanged = async (accounts: string[]) => {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      const root = await getStoredRoot();
      const current = getCurrentAccount();
      const expectedIssuer = current ? getUcanIssuer(current) : "";
      const rootValid =
        root &&
        typeof root.exp === "number" &&
        root.exp > Date.now() &&
        (!expectedIssuer || root.iss === expectedIssuer);

      if (rootValid) {
        // 钱包可能只是锁定，保留已授权的 UCAN
        return;
      }

      localStorage.removeItem("currentAccount");
      await clearUcanSession(UCAN_SESSION_ID);
      localStorage.removeItem("authToken");
      notifyError("❌钱包已断开，请重新连接");
      return;
    }

    const nextAccount = accounts[0];
    const prevAccount = getCurrentAccount();
    if (nextAccount !== prevAccount) {
      localStorage.setItem("currentAccount", nextAccount);
      await clearUcanSession(UCAN_SESSION_ID);
      localStorage.removeItem("authToken");
      await loginWithUcan(provider, nextAccount);
    }
  };

  const handleChainChanged = (chainId: string) => {
    notifyInfo(`已切换网络: ${chainId}`);
  };

  const offAccounts = onAccountsChanged(provider, handleAccountsChanged);
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

// 等待钱包注入
export async function waitForWallet() {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error("❌未检测到钱包");
  }
  return provider;
}

// 连接钱包
export async function connectWallet() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  try {
    try {
      const provider = await requireProvider();
      const accounts = await requestAccounts({ provider });
      if (Array.isArray(accounts) && accounts.length > 0) {
        const currentAccount = accounts[0];
        localStorage.setItem("currentAccount", currentAccount);
        notifySuccess(`✅钱包连接成功！\n账户: ${currentAccount}`);
        await loginWithUcan(provider, currentAccount);
      } else {
        notifyError("❌未获取到账户");
      }
    } catch (error) {
      // 类型守卫：判断是否为具有 message 和 code 的 Error 对象
      if (error && typeof error === "object" && "message" in error) {
        const err = error as {
          message?: string;
          code?: number;
          [key: string]: any;
        };
        console.log(`❌error.message=${err.message}`);
        if (
          typeof err.message === "string" &&
          err.message.includes("Session expired")
        ) {
          notifyError(
            `❌会话已过期，请打开钱包插件输入密码激活钱包状态 ${error}`,
          );
        } else if (err.code === 4001) {
          notifyError(`❌用户拒绝了连接请求 ${error}`);
        } else {
          console.error("❌未知连接错误:", error);
          notifyError(`❌连接失败，请检查钱包状态 ${error}`);
        }
      } else {
        // 处理非标准错误（比如字符串或 null）
        console.error("❌非预期的错误类型:", error);
        notifyError(`❌连接失败，发生未知错误 ${error}`);
      }
      return;
    }
  } catch (error) {
    console.error("❌连接失败:", error);
    notifyError(`❌连接失败: ${error}`);
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
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  try {
    const provider = await requireProvider();
    const chainId = await getChainIdFromSdk(provider);

    if (!chainId) {
      notifyError("❌获取链 ID 失败");
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
    console.error("❌获取链 ID 失败:", error);
    notifyError(`❌获取链 ID 失败: ${error}`);
  }
}

// 获取余额
export async function getBalance() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  const currentAccount = getCurrentAccount();
  if (!currentAccount) {
    notifyError("❌请先连接钱包");
    return;
  }
  try {
    const provider = await requireProvider();
    const balance = await getBalanceFromSdk(provider, currentAccount, "latest");

    // 转换为 ETH
    const ethBalance = parseInt(balance, 16) / 1e18;
    return `余额: ${ethBalance.toFixed(6)} ETH\n原始值: ${balance}`;
  } catch (error) {
    console.error("❌获取余额失败:", error);
    notifyError(`❌获取余额失败: ${error}`);
  }
}

// UCAN 授权
export async function loginWithUcan(
  provider?: Eip1193Provider,
  address?: string,
) {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  if (loginInFlight) {
    return;
  }
  loginInFlight = true;
  try {
    const providerInstance = provider || (await requireProvider());
    const currentAccount = address || getCurrentAccount();
    if (!currentAccount) {
      notifyError("❌请先连接钱包");
      return;
    }

    const existing = await getStoredRoot();
    const expectedIssuer = getUcanIssuer(currentAccount);
    if (
      existing &&
      typeof existing.exp === "number" &&
      existing.exp > Date.now() &&
      existing.iss === expectedIssuer
    ) {
      notifySuccess(`✅已完成授权`);
      window.location.reload();
      return;
    }
    if (
      existing &&
      typeof existing.exp === "number" &&
      existing.exp <= Date.now()
    ) {
      await clearUcanSession(UCAN_SESSION_ID);
    }

    await createRootUcan({
      provider: providerInstance,
      address: currentAccount,
      sessionId: UCAN_SESSION_ID,
      capabilities: getUcanRootCapabilities(),
    });
    localStorage.removeItem("authToken");
    notifySuccess(`✅授权成功`);
    window.location.reload();
  } catch (error) {
    console.error("❌授权失败:", error);
    notifyError(`❌授权失败: ${error}`);
  } finally {
    loginInFlight = false;
  }
}

/**
 * 检查 token 是否有效
 * @param token
 * @returns
 */
export async function isValidUcanAuthorization(): Promise<boolean> {
  try {
    const root = await getStoredRoot();
    if (!root || typeof root.exp !== "number") {
      return false;
    }
    if (root.exp <= Date.now()) {
      return false;
    }
    const account = getCurrentAccount();
    if (!account) {
      return false;
    }
    return root.iss === getUcanIssuer(account);
  } catch (e) {
    return false;
  }
}
