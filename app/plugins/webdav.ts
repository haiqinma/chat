import { authUcanFetch } from "@yeying-community/web3-bs";
import {
  UCAN_SESSION_ID,
  getWebdavAudience,
  getWebdavCapabilities,
} from "./ucan";
import { getCachedUcanSession } from "./ucan-session";

export interface WebDAVQuota {
  quota: number; // 总配额
  used: number; // 已用
  available: number; // 剩余
  percentage: number; // 使用百分比
  unlimited: boolean; // 是否无限
}

export async function fetchQuota(): Promise<WebDAVQuota | undefined> {
  try {
    const audience = getWebdavAudience();
    if (!audience) {
      throw new Error("WebDAV UCAN audience is not configured");
    }
    const issuer = await getCachedUcanSession();
    const response = await authUcanFetch(
      "/api/v1/public/webdav/quota",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      {
        sessionId: UCAN_SESSION_ID,
        audience,
        capabilities: getWebdavCapabilities(),
        issuer: issuer ?? undefined,
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP response.status:{await response.text()}`);
    }

    // 关键一步：告诉 TS “这就是 WebDAVQuota”
    const data: WebDAVQuota = await response.json();
    return data;
  } catch (error) {
    console.error("❌获取 quota 失败:", error);
  }
}
