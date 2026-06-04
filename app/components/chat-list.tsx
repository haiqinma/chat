import DeleteIcon from "../icons/delete.svg";
import SDIcon from "../icons/sd.svg";

import styles from "./home.module.scss";

import { useChatStore } from "../store";
import { useSdStore } from "../store/sd";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { SkillAvatar } from "./mask";
import { Skill } from "../store/skill";
import { useRef, useEffect } from "react";
import { showConfirm } from "./ui-lib";
import { useMobileScreen } from "../utils";
import clsx from "clsx";
import { useAuth } from "../hooks/useAuth";
import { useShallow } from "zustand/react/shallow";
import { CACHE_URL_PREFIX } from "../constant";
import { removeImage } from "../utils/chat";

type WorkspaceItemType = "chat" | "sd";

export function WorkspaceItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  meta: string;
  narrowLabel: string;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  type: WorkspaceItemType;
  skill?: Skill;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);
  const { pathname: currentPath } = useLocation();
  const isSelected =
    props.selected &&
    ((props.type === "chat" &&
      (currentPath === Path.Chat || currentPath === Path.Home)) ||
      (props.type === "sd" && currentPath === Path.Sd));

  return (
    <div
      className={clsx(styles["chat-item"], {
        [styles["chat-item-selected"]]: isSelected,
      })}
      onClick={props.onClick}
      ref={draggableRef}
      title={`${props.title}\n${props.meta}`}
    >
      {props.narrow ? (
        <div className={styles["chat-item-narrow"]}>
          <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
            {props.type === "sd" ? (
              <SDIcon />
            ) : props.skill ? (
              <SkillAvatar
                avatar={props.skill.avatar}
                model={props.skill.modelConfig.model}
              />
            ) : null}
          </div>
          <div className={styles["chat-item-narrow-count"]}>
            {props.narrowLabel}
          </div>
        </div>
      ) : (
        <div className={styles["chat-item-main"]}>
          <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
            {props.type === "sd" ? (
              <SDIcon />
            ) : props.skill ? (
              <SkillAvatar
                avatar={props.skill.avatar}
                model={props.skill.modelConfig.model}
              />
            ) : null}
          </div>
          <div className={styles["chat-item-content"]}>
            <div className={styles["chat-item-title"]}>{props.title}</div>
            <div className={styles["chat-item-info"]}>
              <div className={styles["chat-item-count"]}>{props.meta}</div>
              <div className={styles["chat-item-date"]}>{props.time}</div>
            </div>
          </div>
        </div>
      )}

      {props.onDelete && (
        <div
          className={styles["chat-item-delete"]}
          onClickCapture={(e) => {
            props.onDelete?.();
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <DeleteIcon />
        </div>
      )}
    </div>
  );
}

export const ChatItem = WorkspaceItem;

export function ChatList(props: { narrow?: boolean }) {
  const [sessions, selectedIndex, selectSession] = useChatStore(
    useShallow((state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
    ]),
  );
  const deleteSession = useChatStore((state) => state.deleteSession);
  const sdDraw = useSdStore((state) => state.draw);
  const deleteSdDraw = useSdStore((state) => state.deleteDraw);
  const navigate = useNavigate();
  const { pathname: currentPath, search } = useLocation();
  const selectedSdTaskId = new URLSearchParams(search).get("task");
  const isMobileScreen = useMobileScreen();

  // 权限认证
  const isAuthenticated = useAuth();
  if (!isAuthenticated) {
    return;
  }

  const workspaceItems = [
    ...sessions.map((session, index) => ({
      type: "chat" as const,
      id: session.id,
      title: session.topic,
      meta: Locale.ChatItem.ChatItemCount(session.messages.length),
      narrowLabel: String(session.messages.length),
      time: new Date(session.lastUpdate).toLocaleString(),
      lastUpdate: session.lastUpdate,
      skill: session.mask,
      selected: index === selectedIndex,
      onClick: () => {
        navigate(Path.Chat);
        selectSession(index);
      },
      onDelete: async () => {
        if (
          (!props.narrow && !isMobileScreen) ||
          (await showConfirm(Locale.Home.DeleteChat))
        ) {
          deleteSession(index);
        }
      },
    })),
    ...sdDraw.slice(0, 12).map((item: any, index: number) => {
      const prompt = item.params?.prompt || Locale.Sd.Title;
      const date = item.created_at ? new Date(item.created_at) : undefined;
      const parsedTime = date?.getTime();
      const lastUpdate =
        parsedTime === undefined || Number.isNaN(parsedTime) ? 0 : parsedTime;
      return {
        type: "sd" as const,
        id: item.id,
        title: prompt || Locale.Sd.Title,
        meta: `${Locale.Sd.Title} · ${item.status || ""}`,
        narrowLabel: "AI",
        time: item.created_at || "",
        lastUpdate,
        selected:
          currentPath === Path.Sd
            ? selectedSdTaskId
              ? selectedSdTaskId === item.id
              : index === 0
            : false,
        onClick: () => navigate(`${Path.Sd}?task=${item.id}`),
        onDelete: async () => {
          if (await showConfirm(Locale.Sd.Danger.Delete)) {
            const cleanup =
              typeof item.img_data === "string" &&
              item.img_data.includes(CACHE_URL_PREFIX)
                ? removeImage(item.img_data)
                : Promise.resolve();
            cleanup.finally(() => deleteSdDraw(item.id));
          }
        },
      };
    }),
  ].sort((a, b) => b.lastUpdate - a.lastUpdate);

  return (
    <div className={styles["chat-list"]}>
      {workspaceItems.map((item, index) => (
        <WorkspaceItem
          title={item.title}
          time={item.time}
          meta={item.meta}
          narrowLabel={item.narrowLabel}
          key={`${item.type}-${item.id}`}
          id={`${item.type}-${item.id}`}
          index={index}
          selected={item.selected}
          onClick={item.onClick}
          onDelete={item.onDelete}
          narrow={props.narrow}
          type={item.type}
          skill={item.type === "chat" ? item.skill : undefined}
        />
      ))}
    </div>
  );
}
