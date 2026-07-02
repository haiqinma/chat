import { safeLocalStorage } from "@/app/utils";
import { indexedDBStorage } from "@/app/utils/indexedDB-storage";
import { StoreKey } from "../constant";
import { UCAN_AUTH_EVENT } from "../plugins/wallet";
import { useAccessStore, useAppConfig, useChatStore } from "../store";
import { DEFAULT_ACCESS_STATE } from "../store/access";
import { DEFAULT_CHAT_STATE } from "../store/chat";
import { DEFAULT_CONFIG } from "../store/config";
import { DEFAULT_PROMPT_STATE, usePromptStore } from "../store/prompt";
import { DEFAULT_SKILL_STATE, useSkillStore } from "../store/skill";
import { deepClone } from "./clone";
import { AppState, getLocalAppState, setLocalAppState } from "./sync";

const storage = safeLocalStorage();
const ACCOUNT_WORKSPACE_OWNER_KEY = "accountWorkspaceOwner";
const ACCOUNT_WORKSPACE_SNAPSHOT_PREFIX = "accountWorkspaceSnapshot:";
const GUEST_WORKSPACE_OWNER = "__guest__";
const ACCOUNT_WORKSPACE_SYNC_COOLDOWN_MS = 15_000;

export type AccountWorkspaceStatus =
  | "booting"
  | "switching"
  | "syncing"
  | "ready";

function normalizeWorkspaceOwner(account?: string | null) {
  const normalized = (account || "").trim().toLowerCase();
  return normalized || GUEST_WORKSPACE_OWNER;
}

function getWorkspaceSnapshotKey(owner: string) {
  return `${ACCOUNT_WORKSPACE_SNAPSHOT_PREFIX}${owner}`;
}

function getCurrentAccountOwner() {
  return normalizeWorkspaceOwner(storage.getItem("currentAccount"));
}

export function getAccountWorkspaceOwner() {
  return getCurrentAccountOwner();
}

function createDefaultWorkspaceState(): AppState {
  return {
    [StoreKey.Chat]: deepClone(DEFAULT_CHAT_STATE),
    [StoreKey.Access]: deepClone(DEFAULT_ACCESS_STATE),
    [StoreKey.Config]: deepClone(DEFAULT_CONFIG),
    [StoreKey.Skill]: deepClone(DEFAULT_SKILL_STATE),
    [StoreKey.Prompt]: deepClone(DEFAULT_PROMPT_STATE),
  } as AppState;
}

async function saveWorkspaceSnapshot(owner: string) {
  await indexedDBStorage.setItem(
    getWorkspaceSnapshotKey(owner),
    JSON.stringify(getLocalAppState()),
  );
}

async function loadWorkspaceSnapshot(owner: string) {
  const raw = await indexedDBStorage.getItem(getWorkspaceSnapshotKey(owner));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    await indexedDBStorage.removeItem(getWorkspaceSnapshotKey(owner));
    return null;
  }
}

function workspaceStoresHydrated() {
  return [
    useChatStore.getState()._hasHydrated,
    useAccessStore.getState()._hasHydrated,
    useAppConfig.getState()._hasHydrated,
    useSkillStore.getState()._hasHydrated,
    usePromptStore.getState()._hasHydrated,
  ].every(Boolean);
}

let hasBoundAccountWorkspaceIsolation = false;
let workspaceSwitchChain = Promise.resolve();
let syncSuppressedUntil = 0;
let workspaceStatus: AccountWorkspaceStatus = "booting";
let initialSyncOwner: string | null = null;
const workspaceStatusListeners = new Set<() => void>();

function setWorkspaceStatus(nextStatus: AccountWorkspaceStatus) {
  if (workspaceStatus === nextStatus) return;
  workspaceStatus = nextStatus;
  workspaceStatusListeners.forEach((listener) => listener());
}

export function getAccountWorkspaceStatus() {
  return workspaceStatus;
}

export function getAccountWorkspaceInitialSyncOwner() {
  return initialSyncOwner;
}

export function isAccountWorkspaceInitialSyncPending() {
  return workspaceStatus === "syncing" && !!initialSyncOwner;
}

export function markAccountWorkspaceSyncSettled(owner?: string | null) {
  if (workspaceStatus !== "syncing") return;

  const normalizedOwner = owner ? normalizeWorkspaceOwner(owner) : null;
  if (initialSyncOwner && !normalizedOwner) return;
  if (
    initialSyncOwner &&
    normalizedOwner &&
    initialSyncOwner !== normalizedOwner
  )
    return;

  initialSyncOwner = null;
  setWorkspaceStatus("ready");
}

export function subscribeAccountWorkspaceStatus(listener: () => void) {
  workspaceStatusListeners.add(listener);
  return () => workspaceStatusListeners.delete(listener);
}

export function getAccountWorkspaceSyncDelayMs() {
  if (isAccountWorkspaceInitialSyncPending()) return 0;
  return Math.max(0, syncSuppressedUntil - Date.now());
}

async function switchWorkspaceTo(owner: string) {
  workspaceSwitchChain = workspaceSwitchChain.then(async () => {
    try {
      const normalizedOwner = normalizeWorkspaceOwner(owner);
      const storedOwner = storage.getItem(ACCOUNT_WORKSPACE_OWNER_KEY);

      if (!storedOwner) {
        setWorkspaceStatus("switching");
        storage.setItem(ACCOUNT_WORKSPACE_OWNER_KEY, normalizedOwner);
        await saveWorkspaceSnapshot(normalizedOwner);
        if (normalizedOwner !== GUEST_WORKSPACE_OWNER) {
          initialSyncOwner = normalizedOwner;
          setWorkspaceStatus("syncing");
        } else {
          initialSyncOwner = null;
          setWorkspaceStatus("ready");
        }
        return;
      }

      const currentOwner = normalizeWorkspaceOwner(storedOwner);
      if (currentOwner === normalizedOwner) {
        if (workspaceStatus !== "syncing") {
          setWorkspaceStatus("ready");
        }
        return;
      }

      setWorkspaceStatus("switching");
      await saveWorkspaceSnapshot(currentOwner);
      const snapshot = await loadWorkspaceSnapshot(normalizedOwner);
      const hasLocalSnapshot = !!snapshot;
      const nextState = snapshot || createDefaultWorkspaceState();

      setLocalAppState(nextState);
      storage.setItem(ACCOUNT_WORKSPACE_OWNER_KEY, normalizedOwner);
      syncSuppressedUntil = Date.now() + ACCOUNT_WORKSPACE_SYNC_COOLDOWN_MS;
      if (!hasLocalSnapshot && normalizedOwner !== GUEST_WORKSPACE_OWNER) {
        initialSyncOwner = normalizedOwner;
        setWorkspaceStatus("syncing");
      } else {
        initialSyncOwner = null;
        setWorkspaceStatus("ready");
      }
    } catch (error) {
      console.error("[Workspace] failed to switch account workspace", error);
      initialSyncOwner = null;
      setWorkspaceStatus("ready");
    }
  });

  return workspaceSwitchChain;
}

function bindAccountWorkspaceIsolation() {
  if (typeof window === "undefined" || hasBoundAccountWorkspaceIsolation)
    return;
  hasBoundAccountWorkspaceIsolation = true;

  const reconcile = () => {
    if (!workspaceStoresHydrated()) {
      setWorkspaceStatus("booting");
      return;
    }
    void switchWorkspaceTo(getCurrentAccountOwner());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== "currentAccount") return;
    reconcile();
  };

  if (workspaceStoresHydrated()) {
    reconcile();
  } else {
    const unsubscribers = [
      useChatStore.subscribe(() => {
        if (!workspaceStoresHydrated()) return;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        reconcile();
      }),
      useAccessStore.subscribe(() => {
        if (!workspaceStoresHydrated()) return;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        reconcile();
      }),
      useAppConfig.subscribe(() => {
        if (!workspaceStoresHydrated()) return;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        reconcile();
      }),
      useSkillStore.subscribe(() => {
        if (!workspaceStoresHydrated()) return;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        reconcile();
      }),
      usePromptStore.subscribe(() => {
        if (!workspaceStoresHydrated()) return;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        reconcile();
      }),
    ];
  }

  window.addEventListener(UCAN_AUTH_EVENT, reconcile);
  window.addEventListener("storage", onStorage);
}

bindAccountWorkspaceIsolation();
