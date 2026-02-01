import { useCallback, useEffect, useRef } from "react";
import { useAccessStore, useAppConfig, useChatStore } from "../store";
import { useMaskStore } from "../store/mask";
import { usePromptStore } from "../store/prompt";
import { useSyncStore } from "../store/sync";

export function useAutoSync() {
  const syncStore = useSyncStore();
  const hasHydrated = syncStore._hasHydrated;
  const autoSyncEnabled = syncStore.autoSync;
  const canSync = syncStore.cloudSync();
  const debounceMs = syncStore.autoSyncDebounceMs ?? 2000;
  const intervalMs = syncStore.autoSyncIntervalMs ?? 5 * 60 * 1000;

  const chatUpdate = useChatStore((state) => state.lastUpdateTime);
  const configUpdate = useAppConfig((state) => state.lastUpdateTime);
  const accessUpdate = useAccessStore((state) => state.lastUpdateTime);
  const maskUpdate = useMaskStore((state) => state.lastUpdateTime);
  const promptUpdate = usePromptStore((state) => state.lastUpdateTime);

  const enabled = autoSyncEnabled && hasHydrated && canSync;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const triggerSync = useCallback(
    async (reason: string) => {
      if (!enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await syncStore.sync();
      } catch (e) {
        console.error(`[AutoSync] ${reason} failed`, e);
      } finally {
        inFlightRef.current = false;
      }
    },
    [enabled, syncStore],
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
    maskUpdate,
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
