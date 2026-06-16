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
  const deleteSdSession = useSdStore((state) => state.deleteSession);
  const navigate = useNavigate();
  const { pathname: currentPath, search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const selectedSdSessionId = searchParams.get("session");
  const isMobileScreen = useMobileScreen();

  // 权限认证
  const isAuthenticated = useAuth();
  if (!isAuthenticated) {
    return;
  }

  const sdSessions = Array.from(
    (sdDraw || [])
      .reduce((map: Map<string, any[]>, item: any) => {
        const sessionId = item.session_id || item.id;
        if (!map.has(sessionId)) {
          map.set(sessionId, []);
        }
        map.get(sessionId)!.push(item);
        return map;
      }, new Map<string, any[]>())
      .entries(),
  ).map(([sessionId, items]) => {
    const sortedItems = items.slice().sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return (
        (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
      );
    });
    const latestItem = sortedItems[0];
    const prompt = latestItem?.params?.prompt || Locale.Sd.Title;
    const lastUpdate = new Date(latestItem?.created_at || 0).getTime();

    return {
      sessionId,
      items: sortedItems,
      latestItem,
      prompt,
      lastUpdate: Number.isNaN(lastUpdate) ? 0 : lastUpdate,
    };
  });

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
    ...sdSessions.slice(0, 12).map((session, index: number) => {
      return {
        type: "sd" as const,
        id: session.sessionId,
        title: session.prompt || Locale.Sd.Title,
        meta: `${Locale.Sd.Title} · ${session.items.length}`,
        narrowLabel: String(session.items.length),
        time: session.latestItem?.created_at || "",
        lastUpdate: session.lastUpdate,
        selected:
          currentPath === Path.Sd
            ? selectedSdSessionId
              ? selectedSdSessionId === session.sessionId
              : index === 0
            : false,
        onClick: () => navigate(`${Path.Sd}?session=${session.sessionId}`),
        onDelete: async () => {
          if (await showConfirm(Locale.Sd.Danger.Delete)) {
            const cleanup = Promise.all(
              session.items.map((item: any) =>
                typeof item.img_data === "string" &&
                item.img_data.includes(CACHE_URL_PREFIX)
                  ? removeImage(item.img_data)
                  : Promise.resolve(),
              ),
            );
            cleanup.finally(() => deleteSdSession(session.sessionId));
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
