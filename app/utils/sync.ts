import {
  ChatSession,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import { useSkillStore } from "../store/skill";
import { usePromptStore } from "../store/prompt";
import { StoreKey } from "../constant";
import { merge } from "./merge";
import { deepClone } from "./clone";

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isStreamingMessage(message: { status?: string; streaming?: boolean }) {
  return message?.status === "streaming" || Boolean(message?.streaming);
}

function isEmptyResponseMessage(message: {
  isError?: boolean;
  content?: unknown;
}) {
  return (
    Boolean(message?.isError) &&
    typeof message.content === "string" &&
    message.content.includes("empty response")
  );
}

function hasMessageContent(message: { content?: unknown }) {
  if (typeof message.content === "string") {
    return message.content.trim().length > 0;
  }
  if (Array.isArray(message.content)) {
    return message.content.length > 0;
  }
  return Boolean(message.content);
}

function getMessageUpdatedAt(message: { updatedAt?: number; date?: string }) {
  if (typeof message.updatedAt === "number") return message.updatedAt;
  if (message.date) {
    const parsed = new Date(message.date).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mergeDeletedSessions(
  localDeleted: Record<string, number> | undefined,
  remoteDeleted: Record<string, number> | undefined,
) {
  const merged: Record<string, number> = {
    ...(remoteDeleted || {}),
  };
  if (localDeleted) {
    Object.entries(localDeleted).forEach(([id, ts]) => {
      const current = merged[id] ?? 0;
      if (ts > current) {
        merged[id] = ts;
      }
    });
  }
  const now = Date.now();
  Object.entries(merged).forEach(([id, ts]) => {
    if (now - ts > TOMBSTONE_TTL_MS) {
      delete merged[id];
    }
  });
  return merged;
}

function mergeDeletedMessages(
  localDeleted: Record<string, number> | undefined,
  remoteDeleted: Record<string, number> | undefined,
) {
  const merged: Record<string, number> = {
    ...(remoteDeleted || {}),
  };
  if (localDeleted) {
    Object.entries(localDeleted).forEach(([id, ts]) => {
      const current = merged[id] ?? 0;
      if (ts > current) {
        merged[id] = ts;
      }
    });
  }
  const now = Date.now();
  Object.entries(merged).forEach(([id, ts]) => {
    if (now - ts > TOMBSTONE_TTL_MS) {
      delete merged[id];
    }
  });
  return merged;
}
type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type NonFunctionFields<T> = Pick<T, NonFunctionKeys<T>>;

export function getNonFunctionFileds<T extends object>(obj: T) {
  const ret: any = {};

  Object.entries(obj).map(([k, v]) => {
    if (typeof v !== "function") {
      ret[k] = v;
    }
  });

  return ret as NonFunctionFields<T>;
}

export type GetStoreState<T> = T extends { getState: () => infer U }
  ? NonFunctionFields<U>
  : never;

const LocalStateGetters = {
  [StoreKey.Chat]: () => getNonFunctionFileds(useChatStore.getState()),
  [StoreKey.Access]: () => getNonFunctionFileds(useAccessStore.getState()),
  [StoreKey.Config]: () => getNonFunctionFileds(useAppConfig.getState()),
  [StoreKey.Skill]: () => getNonFunctionFileds(useSkillStore.getState()),
  [StoreKey.Prompt]: () => getNonFunctionFileds(usePromptStore.getState()),
} as const;

export type AppState = {
  [k in keyof typeof LocalStateGetters]: ReturnType<
    (typeof LocalStateGetters)[k]
  >;
};

type Merger<T extends keyof AppState, U = AppState[T]> = (
  localState: U,
  remoteState: U,
) => U;

type StateMerger = {
  [K in keyof AppState]: Merger<K>;
};

// we merge remote state to local state
const MergeStates: StateMerger = {
  [StoreKey.Chat]: (localState, remoteState) => {
    const mergedDeleted = mergeDeletedSessions(
      localState.deletedSessions,
      remoteState.deletedSessions,
    );
    localState.deletedSessions = mergedDeleted;
    const mergedDeletedMessages = mergeDeletedMessages(
      localState.deletedMessages,
      remoteState.deletedMessages,
    );
    localState.deletedMessages = mergedDeletedMessages;

    const shouldKeepSession = (session: ChatSession) => {
      const deletedAt = mergedDeleted[session.id];
      if (!deletedAt) return true;
      return deletedAt < session.lastUpdate;
    };

    const shouldDropMessage = (message: {
      id?: string;
      updatedAt?: number;
    }) => {
      const messageId = message?.id || "";
      if (!messageId) return false;
      const deletedAt = mergedDeletedMessages[messageId];
      if (!deletedAt) return false;
      const updatedAt = getMessageUpdatedAt(message);
      if (updatedAt > deletedAt) {
        delete mergedDeletedMessages[messageId];
        return false;
      }
      return true;
    };

    // merge sessions
    const localSessions: Record<string, ChatSession> = {};
    localState.sessions.forEach((s) => (localSessions[s.id] = s));

    remoteState.sessions.forEach((remoteSession) => {
      if (!shouldKeepSession(remoteSession)) return;
      // skip empty chats
      if (remoteSession.messages.length === 0) return;

      const localSession = localSessions[remoteSession.id];
      if (!localSession) {
        // if remote session is new, just merge it
        const nextRemote = {
          ...remoteSession,
          messages: remoteSession.messages.filter(
            (message) => !shouldDropMessage(message),
          ),
        };
        if (nextRemote.messages.length > 0) {
          localState.sessions.push(nextRemote);
        }
      } else {
        const localMessageMap = new Map(
          localSession.messages.map((message) => [message.id, message]),
        );
        remoteSession.messages.forEach((remoteMessage) => {
          if (shouldDropMessage(remoteMessage)) return;
          if (isStreamingMessage(remoteMessage)) return;
          const localMessage = localMessageMap.get(remoteMessage.id);
          if (!localMessage) {
            localSession.messages.push(remoteMessage);
            return;
          }
          if (
            isEmptyResponseMessage(localMessage) &&
            hasMessageContent(remoteMessage)
          ) {
            Object.assign(localMessage, remoteMessage);
            return;
          }
          const localUpdatedAt = getMessageUpdatedAt(localMessage);
          const remoteUpdatedAt = getMessageUpdatedAt(remoteMessage);
          if (remoteUpdatedAt > localUpdatedAt) {
            Object.assign(localMessage, remoteMessage);
          }
        });

        localSession.messages = localSession.messages.filter(
          (message) => !shouldDropMessage(message),
        );

        // sort local messages with date field in asc order
        localSession.messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      }
    });

    localState.sessions = localState.sessions.filter(shouldKeepSession);

    // sort local sessions with date field in desc order
    localState.sessions.sort(
      (a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );

    return localState;
  },
  [StoreKey.Prompt]: (localState, remoteState) => {
    localState.prompts = {
      ...remoteState.prompts,
      ...localState.prompts,
    };
    return localState;
  },
  [StoreKey.Skill]: (localState, remoteState) => {
    const localSkillState = localState as typeof localState & {
      masks?: typeof localState.skills;
    };
    const remoteSkillState = remoteState as typeof remoteState & {
      masks?: typeof remoteState.skills;
    };
    localState.skills = {
      ...(remoteSkillState.skills ?? remoteSkillState.masks ?? {}),
      ...(localSkillState.skills ?? localSkillState.masks ?? {}),
    };
    return localState;
  },
  [StoreKey.Config]: (localState, remoteState) =>
    mergeWithUpdate<AppState[StoreKey.Config]>(
      localState,
      remoteState,
      StoreKey.Config,
    ),
  [StoreKey.Access]: (localState, remoteState) =>
    mergeWithUpdate<AppState[StoreKey.Access]>(
      localState,
      remoteState,
      StoreKey.Access,
    ),
};

export function getLocalAppState() {
  const appState = Object.fromEntries(
    Object.entries(LocalStateGetters).map(([key, getter]) => {
      return [key, getter()];
    }),
  ) as AppState;

  return appState;
}

export function getLocalAppStateForSync() {
  const appState = getLocalAppState();
  const chatState = deepClone(appState[StoreKey.Chat]);
  const now = Date.now();
  if (chatState.deletedMessages) {
    Object.entries(chatState.deletedMessages).forEach(([id, ts]) => {
      const tsValue = Number(ts);
      if (!Number.isFinite(tsValue) || now - tsValue > TOMBSTONE_TTL_MS) {
        delete chatState.deletedMessages[id];
      }
    });
  }

  chatState.sessions = chatState.sessions
    .filter(
      (session: ChatSession) => !session.messages.some(isStreamingMessage),
    )
    .map((session: ChatSession) => ({
      ...session,
      messages: session.messages.filter((message) => {
        if (isStreamingMessage(message) || isEmptyResponseMessage(message)) {
          return false;
        }
        const deletedAt = chatState.deletedMessages?.[message.id] ?? 0;
        if (!deletedAt) return true;
        const updatedAt = getMessageUpdatedAt(message);
        return updatedAt > deletedAt;
      }),
    }));

  return {
    ...appState,
    [StoreKey.Chat]: chatState,
  } as AppState;
}

export function setLocalAppState(appState: AppState) {
  useChatStore.setState(appState[StoreKey.Chat]);
  useAccessStore.setState(appState[StoreKey.Access]);
  useAppConfig.setState(appState[StoreKey.Config]);
  useSkillStore.setState(appState[StoreKey.Skill]);
  usePromptStore.setState(appState[StoreKey.Prompt]);
}

export function mergeAppState(localState: AppState, remoteState: AppState) {
  Object.keys(localState).forEach(<T extends keyof AppState>(k: string) => {
    const key = k as T;
    const localStoreState = localState[key];
    const remoteStoreState = remoteState[key];
    MergeStates[key](localStoreState, remoteStoreState);
  });

  return localState;
}

/**
 * Merge state with `lastUpdateTime`, older state will be override
 */
export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
  debugName?: string,
) {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  const remoteUpdateTime = remoteState.lastUpdateTime ?? 0;

  const useRemote = localUpdateTime < remoteUpdateTime;

  if (useRemote) {
    // Remote is newer, so apply remote on top of local.
    merge(localState, remoteState);
    const merged = { ...localState };
    if (debugName === StoreKey.Config || debugName === StoreKey.Access) {
      const localModel = (localState as any)?.modelConfig?.model;
      const remoteModel = (remoteState as any)?.modelConfig?.model;
      const mergedModel = (merged as any)?.modelConfig?.model;
      console.info("[Sync] mergeWithUpdate choose remote", {
        key: debugName,
        localUpdateTime,
        remoteUpdateTime,
        localModel,
        remoteModel,
        mergedModel,
      });
    }
    return merged;
  }

  // Local is newer or equal, so keep local values.
  merge(remoteState, localState);
  const merged = { ...remoteState };
  if (debugName === StoreKey.Config || debugName === StoreKey.Access) {
    const localModel = (localState as any)?.modelConfig?.model;
    const remoteModel = (remoteState as any)?.modelConfig?.model;
    const mergedModel = (merged as any)?.modelConfig?.model;
    console.info("[Sync] mergeWithUpdate keep local", {
      key: debugName,
      localUpdateTime,
      remoteUpdateTime,
      localModel,
      remoteModel,
      mergedModel,
    });
  }
  return merged;
}
