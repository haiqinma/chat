import chatStyles from "@/app/components/chat.module.scss";
import styles from "@/app/components/sd/sd.module.scss";
import homeStyles from "@/app/components/home.module.scss";

import { IconButton } from "@/app/components/button";
import ReturnIcon from "@/app/icons/return.svg";
import Locale from "@/app/locales";
import { Path, CACHE_URL_PREFIX } from "@/app/constant";
import React, { useEffect, useMemo, useRef } from "react";
import {
  copyToClipboard,
  getMessageTextContent,
  useMobileScreen,
} from "@/app/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppConfig } from "@/app/store";
import MinIcon from "@/app/icons/min.svg";
import MaxIcon from "@/app/icons/max.svg";
import { getClientConfig } from "@/app/config/client";
import DeleteIcon from "@/app/icons/clear.svg";
import CopyIcon from "@/app/icons/copy.svg";
import PromptIcon from "@/app/icons/prompt.svg";
import ResetIcon from "@/app/icons/reload.svg";
import EditIcon from "@/app/icons/edit.svg";
import { useSdStore } from "@/app/store/sd";
import LoadingIcon from "@/app/icons/three-dots.svg";
import ErrorIcon from "@/app/icons/delete.svg";
import SDIcon from "@/app/icons/sd.svg";
import { Property } from "csstype";
import {
  showConfirm,
  showImageModal,
  showModal,
} from "@/app/components/ui-lib";
import { removeImage } from "@/app/utils/chat";
import { SideBar } from "./sd-sidebar";
import { WindowContent } from "@/app/components/home";
import clsx from "clsx";
import { getParamDisplayValue, getParamLabel } from "./image-param-display";

function getSdTaskStatus(item: any) {
  let s: string;
  let color: Property.Color | undefined = undefined;
  switch (item.status) {
    case "success":
      s = Locale.Sd.Status.Success;
      color = "green";
      break;
    case "error":
      s = Locale.Sd.Status.Error;
      color = "red";
      break;
    case "wait":
      s = Locale.Sd.Status.Wait;
      color = "yellow";
      break;
    case "running":
      s = Locale.Sd.Status.Running;
      color = "blue";
      break;
    default:
      s = item.status.toUpperCase();
  }
  return (
    <div
      className={styles["status-chip"]}
      title={item.error}
      style={{ color: color }}
    >
      <span>{s}</span>
      {item.status === "error" && (
        <span
          className={clsx("clickable", styles["status-chip-detail"])}
          onClick={() => {
            showModal({
              title: Locale.Sd.Detail,
              children: (
                <div style={{ color: color, userSelect: "text" }}>
                  {item.error}
                </div>
              ),
            });
          }}
        >
          {item.error}
        </span>
      )}
    </div>
  );
}

export function Sd() {
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const location = useLocation();
  const clientConfig = useMemo(() => getClientConfig(), []);
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;
  const config = useAppConfig();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sdStore = useSdStore();
  const currentSessionId = sdStore.currentSessionId;
  const setCurrentSessionId = sdStore.setCurrentSessionId;
  const isSd = location.pathname === Path.Sd;
  const searchParams = new URLSearchParams(location.search);
  const selectedSessionId = searchParams.get("session");
  const activeSessionId = selectedSessionId || currentSessionId || "";
  const sdImages = useMemo(() => {
    if (!activeSessionId) {
      return sdStore.draw.filter((item: any) => !item.session_id);
    }
    return sdStore.draw.filter(
      (item: any) => item.session_id === activeSessionId,
    );
  }, [activeSessionId, sdStore.draw]);

  useEffect(() => {
    if (selectedSessionId && currentSessionId !== selectedSessionId) {
      setCurrentSessionId(selectedSessionId);
    }
  }, [currentSessionId, selectedSessionId, setCurrentSessionId]);

  return (
    <>
      <SideBar className={clsx({ [homeStyles["sidebar-show"]]: isSd })} />
      <WindowContent>
        <div className={chatStyles.chat} key={"1"}>
          <div className="window-header" data-tauri-drag-region>
            {isMobileScreen && (
              <div className="window-actions">
                <div className={"window-action-button"}>
                  <IconButton
                    icon={<ReturnIcon />}
                    bordered
                    title={Locale.Chat.Actions.ChatList}
                    onClick={() => navigate(Path.Sd)}
                  />
                </div>
              </div>
            )}
            <div
              className={clsx(
                "window-header-title",
                chatStyles["chat-body-title"],
              )}
            >
              <div className={`window-header-main-title`}>
                {Locale.Sd.Title}
              </div>
              <div className="window-header-sub-title">
                {Locale.Sd.SubTitle(sdImages.length || 0)}
              </div>
            </div>

            <div className="window-actions">
              {showMaxIcon && (
                <div className="window-action-button">
                  <IconButton
                    aria={Locale.Chat.Actions.FullScreen}
                    icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                    bordered
                    onClick={() => {
                      config.update(
                        (config) => (config.tightBorder = !config.tightBorder),
                      );
                    }}
                  />
                </div>
              )}
              {isMobileScreen && <SDIcon width={50} height={50} />}
            </div>
          </div>
          <div className={chatStyles["chat-body"]} ref={scrollRef}>
            <div className={styles["sd-img-list"]}>
              {sdImages.length > 0 ? (
                sdImages.map((item: any) => {
                  const prompt = item.params?.prompt || "";
                  return (
                    <div key={item.id} className={styles["sd-img-item"]}>
                      <div className={styles["sd-img-preview"]}>
                        {item.status === "success" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className={styles["img"]}
                            src={item.img_data}
                            alt={item.id}
                            onClick={() =>
                              showImageModal(
                                item.img_data,
                                true,
                                isMobileScreen
                                  ? { width: "100%", height: "fit-content" }
                                  : { maxWidth: "100%", maxHeight: "100%" },
                                isMobileScreen
                                  ? { width: "100%", height: "fit-content" }
                                  : { width: "100%", height: "100%" },
                              )
                            }
                          />
                        ) : item.status === "error" ? (
                          <div className={styles["pre-img"]}>
                            <ErrorIcon />
                          </div>
                        ) : (
                          <div className={styles["pre-img"]}>
                            <LoadingIcon />
                          </div>
                        )}
                      </div>
                      <div className={styles["sd-img-item-info"]}>
                        <div className={styles["sd-img-item-header"]}>
                          <div className={styles["sd-img-item-title-block"]}>
                            <button
                              type="button"
                              className={styles["prompt-link"]}
                              title={prompt}
                              onClick={() => {
                                showModal({
                                  title: Locale.Sd.Detail,
                                  children: (
                                    <div style={{ userSelect: "text" }}>
                                      {prompt}
                                    </div>
                                  ),
                                });
                              }}
                            >
                              {prompt}
                            </button>
                            <div className={styles["sd-img-sub-meta"]}>
                              <span>{item.created_at}</span>
                              <span>{item.model_name}</span>
                              <span>{item.provider_name}</span>
                            </div>
                          </div>
                          {getSdTaskStatus(item)}
                        </div>
                        <div className={styles["sd-img-actions"]}>
                          <IconButton
                            icon={<PromptIcon />}
                            bordered
                            title={Locale.Sd.Actions.Params}
                            onClick={() => {
                              showModal({
                                title: Locale.Sd.GenerateParams,
                                children: (
                                  <div style={{ userSelect: "text" }}>
                                    {Object.keys(item.params).map((key) => {
                                      const label = getParamLabel(key);
                                      const value = getParamDisplayValue(
                                        item.model,
                                        key,
                                        item.params[key],
                                        item.params,
                                      );

                                      return (
                                        <div
                                          key={key}
                                          style={{ margin: "10px" }}
                                        >
                                          <strong>{label}: </strong>
                                          {value}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ),
                              });
                            }}
                          />
                          <IconButton
                            icon={<CopyIcon />}
                            bordered
                            title={Locale.Sd.Actions.Copy}
                            onClick={() =>
                              copyToClipboard(
                                getMessageTextContent({
                                  role: "user",
                                  content: item.params.prompt,
                                }),
                              )
                            }
                          />
                          <IconButton
                            icon={<ResetIcon />}
                            bordered
                            title={Locale.Sd.Actions.Retry}
                            onClick={() => {
                              const reqData = {
                                provider: item.provider,
                                provider_name: item.provider_name,
                                endpoint_type: item.endpoint_type,
                                session_id:
                                  item.session_id || activeSessionId || "",
                                model_def: item.model_def,
                                model: item.model,
                                model_name: item.model_name,
                                status: "wait",
                                source_image: item.source_image || "",
                                mask_image: item.mask_image || "",
                                params: { ...item.params },
                                created_at: new Date().toLocaleString(),
                                img_data: "",
                              };
                              sdStore.sendTask(reqData);
                            }}
                          />
                          {item.status === "success" && !!item.img_data && (
                            <IconButton
                              icon={<EditIcon />}
                              bordered
                              title={Locale.Sd.Actions.EditAgain}
                              onClick={() => {
                                if (item.session_id) {
                                  sdStore.setCurrentSessionId(item.session_id);
                                }
                                sdStore.setCurrentMode("editing");
                                sdStore.setEditSourceType("history");
                                if (item.model_def) {
                                  sdStore.setCurrentModel(item.model_def);
                                }
                                if (item.params) {
                                  sdStore.setCurrentParams({
                                    ...item.params,
                                  });
                                }
                                sdStore.setEditSourceImage(
                                  item.img_data,
                                  `${item.model_name} · ${item.created_at}`,
                                );
                                sdStore.setEditMaskImage("", "");
                                navigate(Path.Sd);
                              }}
                            />
                          )}
                          <IconButton
                            icon={<DeleteIcon />}
                            bordered
                            title={Locale.Sd.Actions.Delete}
                            onClick={async () => {
                              if (await showConfirm(Locale.Sd.Danger.Delete)) {
                                const cleanup =
                                  typeof item.img_data === "string" &&
                                  item.img_data.includes(CACHE_URL_PREFIX)
                                    ? removeImage(item.img_data)
                                    : Promise.resolve();
                                cleanup.finally(() => {
                                  sdStore.deleteDraw(item.id);
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div>{Locale.Sd.EmptyRecord}</div>
              )}
            </div>
          </div>
        </div>
      </WindowContent>
    </>
  );
}
