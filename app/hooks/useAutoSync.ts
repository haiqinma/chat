import { useCallback, useEffect, useRef, useState } from "react";
import { useAccessStore, useAppConfig, useChatStore } from "../store";
import { useSkillStore } from "../store/skill";
import { usePromptStore } from "../store/prompt";
import { useSyncStore } from "../store/sync";
import { UCAN_AUTH_EVENT } from "../plugins/wallet";
import {
  isUcanSignPending,
  isUcanSignPendingError,
} from "../plugins/ucan-sign-lock";

export function useAutoSync() {
  const hasHydrated = useSyncStore((state) => state._hasHydrated);
  const autoSyncEnabled = useSyncStore((state) => state.autoSync);
  const autoSync = useSyncStore((state) => state.sync);
  const cloudSync = useSyncStore((state) => state.cloudSync);
  const autoSyncDebounceMs = useSyncStore((state) => state.autoSyncDebounceMs);
  const autoSyncIntervalMs = useSyncStore((state) => state.autoSyncIntervalMs);
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
  const inFlightRef = useRef(false);

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
      if (!enabled || inFlightRef.current) return;
      if (isUcanSignPending()) {
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
      inFlightRef.current = true;
      try {
        await autoSync({ interactive: false });
      } catch (e) {
        if (isUcanSignPendingError(e)) {
          return;
        }
        console.error(`[AutoSync] ${reason} failed`, e);
      } finally {
        inFlightRef.current = false;
      }
    },
    [autoSync, debounceMs, enabled],
  );

  const scheduleSync = useCallback(
    (reason: string) => {
      if (!enabled) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        triggerSync(reason);
      }, debounceMs);
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
  }, [enabled, triggerSync]);

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
    if (enabled) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
}
