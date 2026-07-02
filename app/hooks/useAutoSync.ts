import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAccessStore, useAppConfig, useChatStore } from "../store";
import { useSkillStore } from "../store/skill";
import { usePromptStore } from "../store/prompt";
import { useSyncStore } from "../store/sync";
import { UCAN_AUTH_EVENT } from "../plugins/wallet";
import {
  isUcanSignPending,
  isUcanSignPendingError,
} from "../plugins/ucan-sign-lock";
import {
  getAccountWorkspaceInitialSyncOwner,
  getAccountWorkspaceStatus,
  getAccountWorkspaceSyncDelayMs,
  isAccountWorkspaceInitialSyncPending,
  markAccountWorkspaceSyncSettled,
  subscribeAccountWorkspaceStatus,
} from "../utils/account-workspace";

let autoSyncInFlight = false;
let lastAutoSyncAt = 0;
const AUTO_SYNC_DEDUPE_WINDOW_MS = 1500;

export function useAutoSync() {
  const hasHydrated = useSyncStore((state) => state._hasHydrated);
  const autoSyncEnabled = useSyncStore((state) => state.autoSync);
  const autoSync = useSyncStore((state) => state.sync);
  const cloudSync = useSyncStore((state) => state.cloudSync);
  const autoSyncDebounceMs = useSyncStore((state) => state.autoSyncDebounceMs);
  const autoSyncIntervalMs = useSyncStore((state) => state.autoSyncIntervalMs);
  const workspaceStatus = useSyncExternalStore(
    subscribeAccountWorkspaceStatus,
    getAccountWorkspaceStatus,
    getAccountWorkspaceStatus,
  );
  const [authTick, setAuthTick] = useState(0);
  const canSync = cloudSync() && authTick >= 0;
  const debounceMs = autoSyncDebounceMs ?? 2000;
  const intervalMs = autoSyncIntervalMs ?? 5 * 60 * 1000;

  const chatUpdate = useChatStore((state) => state.lastUpdateTime);
  const configUpdate = useAppConfig((state) => state.lastUpdateTime);
  const accessUpdate = useAccessStore((state) => state.lastUpdateTime);
  const skillUpdate = useSkillStore((state) => state.lastUpdateTime);
  const promptUpdate = usePromptStore((state) => state.lastUpdateTime);

  const enabled = autoSyncEnabled && hasHydrated && canSync;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onAuthChange = () => {
      setAuthTick((value) => value + 1);
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, []);

  const triggerSync = useCallback(
    async (reason: string) => {
      const initialWorkspaceSyncPending =
        isAccountWorkspaceInitialSyncPending();
      const initialSyncOwner = initialWorkspaceSyncPending
        ? getAccountWorkspaceInitialSyncOwner()
        : null;
      if (!enabled) return;
      if (autoSyncInFlight) {
        if (initialWorkspaceSyncPending) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => {
            triggerSync(`${reason}:in-flight`);
          }, 300);
        }
        return;
      }
      const workspaceSyncDelayMs = getAccountWorkspaceSyncDelayMs();
      if (workspaceSyncDelayMs > 0) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          triggerSync(`${reason}:workspace-delay`);
        }, workspaceSyncDelayMs);
        return;
      }
      const now = Date.now();
      if (
        !initialWorkspaceSyncPending &&
        now - lastAutoSyncAt < AUTO_SYNC_DEDUPE_WINDOW_MS
      )
        return;
      if (isUcanSignPending()) {
        if (initialWorkspaceSyncPending) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => {
            triggerSync(`${reason}:sign-pending`);
          }, 300);
        }
        return;
      }
      if (useChatStore.getState().hasStreaming?.()) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          triggerSync("streaming");
        }, debounceMs);
        return;
      }
      autoSyncInFlight = true;
      try {
        await autoSync({ interactive: false });
        lastAutoSyncAt = Date.now();
      } catch (e) {
        if (isUcanSignPendingError(e)) {
          return;
        }
        console.error(`[AutoSync] ${reason} failed`, e);
      } finally {
        autoSyncInFlight = false;
        if (initialSyncOwner) {
          markAccountWorkspaceSyncSettled(initialSyncOwner);
        }
      }
    },
    [autoSync, debounceMs, enabled],
  );

  const scheduleSync = useCallback(
    (reason: string) => {
      if (!enabled) return;
      const workspaceSyncDelayMs = getAccountWorkspaceSyncDelayMs();
      const delayMs = isAccountWorkspaceInitialSyncPending()
        ? 0
        : Math.max(debounceMs, workspaceSyncDelayMs);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        triggerSync(reason);
      }, delayMs);
    },
    [debounceMs, enabled, triggerSync],
  );

  useEffect(() => {
    if (!enabled) return;
    scheduleSync("change");
  }, [
    accessUpdate,
    chatUpdate,
    configUpdate,
    skillUpdate,
    promptUpdate,
    enabled,
    scheduleSync,
  ]);

  useEffect(() => {
    if (!enabled) return;
    triggerSync("startup");
  }, [enabled, triggerSync, workspaceStatus]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      triggerSync("interval");
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, triggerSync]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleSync("visibility");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, scheduleSync]);

  useEffect(() => {
    if (enabled || !hasHydrated) return;
    if (
      isAccountWorkspaceInitialSyncPending() &&
      (!autoSyncEnabled || !cloudSync())
    ) {
      markAccountWorkspaceSyncSettled(getAccountWorkspaceInitialSyncOwner());
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [autoSyncEnabled, cloudSync, enabled, hasHydrated, workspaceStatus]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
}
