import { useEffect, useState } from "react";
import { IconButton } from "./button";
import { List, ListItem } from "./ui-lib";
import CloseIcon from "../icons/close.svg";
import styles from "./my-center.module.scss";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import { fetchQuota, WebDAVQuota } from "../plugins/webdav";
import { getClientConfig } from "../config/client";

const mockUsage = {
  totalCost: "¥128.50",
  totalTokens: "2,450,000",
};

function formatBytes(bytes?: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision =
    unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function resolveConfigUrl(url?: string | null): string {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return "";
  }
}

function openExternalUrl(url: string) {
  if (!url) return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}

export function Centers() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"storage" | "usage">("storage");
  const clientConfig = getClientConfig();
  const webdavPortalUrl = resolveConfigUrl(clientConfig?.webdavBackendBaseUrl);
  const routerPortalUrl = resolveConfigUrl(clientConfig?.routerBackendUrl);

  const tabs = [
    { key: "storage", label: Locale.MyCenter.Tab1.Title },
    { key: "usage", label: Locale.MyCenter.Tab3.Title },
  ];

  const [storageQuota, setStorageQuota] = useState<WebDAVQuota | null>(null);

  useEffect(() => {
    const loadQuota = async () => {
      const quota = await fetchQuota();
      if (quota) {
        setStorageQuota(quota);
      }
    };
    loadQuota();
  }, []);

  return (
    <div className={styles["center-page"]}>
      <div className="window-header" data-tauri-drag-region>
        <div className="window-header-title">
          <div className="window-header-main-title">
            {Locale.MyCenter.Title}
          </div>
          <div className="window-header-sub-title">
            {Locale.MyCenter.SubTitle}
          </div>
        </div>
        <div className="window-actions">
          <div className="window-action-button"></div>
          <div className="window-action-button"></div>
          <div className="window-action-button">
            <IconButton
              aria={Locale.UI.Close}
              icon={<CloseIcon />}
              onClick={() => navigate(Path.Home)}
              bordered
            />
          </div>
        </div>
      </div>

      <div className={styles["profile"]}>
        {/* Tab 导航 */}
        <div className={styles["tabs"]}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles["tab"]} ${
                activeTab === tab.key ? styles["active"] : ""
              }`}
              onClick={() => setActiveTab(tab.key as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className={styles["tab-content"]}>
          {activeTab === "storage" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Total}
                subTitle={
                  storageQuota?.unlimited
                    ? "∞"
                    : formatBytes(storageQuota?.quota)
                }
              />
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Used}
                subTitle={formatBytes(storageQuota?.used)}
              />
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Remain}
                subTitle={
                  storageQuota?.unlimited
                    ? "∞"
                    : formatBytes(storageQuota?.available)
                }
              />
              <ListItem
                title={Locale.MyCenter.Tab4.Info.StorageExpansion}
                subTitle={Locale.MyCenter.Tab4.Info.Desc1}
              >
                <IconButton
                  text={Locale.MyCenter.Tab4.Info.ImmediatelyExpandCapacity}
                  type="primary"
                  onClick={() => {
                    if (!webdavPortalUrl) {
                      console.warn(
                        "[MyCenter] missing webdavBackendBaseUrl in client config",
                      );
                      return;
                    }
                    openExternalUrl(webdavPortalUrl);
                  }}
                />
              </ListItem>
            </List>
          )}

          {activeTab === "usage" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab3.Info.Moneys}
                subTitle={mockUsage.totalCost}
              />
              <ListItem
                title={Locale.MyCenter.Tab3.Info.Tokens}
                subTitle={mockUsage.totalTokens}
              />
              <ListItem
                title={Locale.MyCenter.Tab4.Info.TopUpBalance}
                subTitle={Locale.MyCenter.Tab4.Info.Desc2}
              >
                <IconButton
                  text={Locale.MyCenter.Tab4.Info.GotoRecharge}
                  type="primary"
                  onClick={() => {
                    if (!routerPortalUrl) {
                      console.warn(
                        "[MyCenter] missing routerBackendUrl in client config",
                      );
                      return;
                    }
                    openExternalUrl(routerPortalUrl);
                  }}
                />
              </ListItem>
            </List>
          )}
        </div>
      </div>
    </div>
  );
}
