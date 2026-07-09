import { useEffect, useMemo, useState } from "react";
import { ModelCandidate } from "../client/api";
import { RouterApi, type RouterTokenStatus } from "../client/platforms/router";
import {
  useAccessStore,
  useAppConfig,
  useSkillProviderModelsStore,
} from "../store";
import {
  collectModelsWithDefaultModel,
  filterModelsByCandidates,
  normalizeModels,
} from "./model";

export function useAllModels() {
  const config = useAppConfig();
  const accessStore = useAccessStore();

  return useMemo(() => {
    return collectModelsWithDefaultModel(
      config.models,
      accessStore.defaultModel,
    );
  }, [config.models, accessStore.defaultModel]);
}

export function useSkillProviderModels() {
  const models = useSkillProviderModelsStore((state) => state.models);

  return useMemo(() => normalizeModels(models), [models]);
}

export const useMaskProviderModels = useSkillProviderModels;

export type RouterTokenStatusSummary = {
  status: RouterTokenStatus | null;
  disabled: boolean;
  expired: boolean;
  depleted: boolean;
};

const EMPTY_ROUTER_TOKEN_STATUS_SUMMARY: RouterTokenStatusSummary = {
  status: null,
  disabled: false,
  expired: false,
  depleted: false,
};

function summarizeRouterTokenStatus(
  status: RouterTokenStatus | null,
): RouterTokenStatusSummary {
  const statusValue =
    typeof status?.status === "string"
      ? status.status.trim().toLowerCase()
      : status?.status;
  const disabled =
    statusValue === 0 ||
    statusValue === "0" ||
    statusValue === "disabled" ||
    statusValue === "inactive";
  const expired =
    !!status?.expires_at &&
    status.expires_at > 0 &&
    status.expires_at <= Date.now();
  const depleted =
    status?.unlimited_quota !== true &&
    (status?.total_available ?? status?.remaining_amount) === 0;

  return {
    status,
    disabled,
    expired,
    depleted,
  };
}

export function useSessionModels(candidateModels?: readonly ModelCandidate[]) {
  const allModels = useAllModels();

  return useMemo(() => {
    const availableModels = allModels.filter((model) => model.available);
    return filterModelsByCandidates(availableModels, candidateModels);
  }, [allModels, candidateModels]);
}

export function useRouterTokenStatus() {
  const selectedRouterToken = useAccessStore((state) =>
    state.selectedRouterToken.trim(),
  );
  const routerApiKey = useAccessStore((state) => state.openaiApiKey.trim());
  const [summary, setSummary] = useState<RouterTokenStatusSummary>(
    EMPTY_ROUTER_TOKEN_STATUS_SUMMARY,
  );

  useEffect(() => {
    let cancelled = false;

    if (!selectedRouterToken && !routerApiKey) {
      return;
    }

    const api = new RouterApi();
    api
      .publicTokenStatus()
      .then((nextStatus) => {
        if (!cancelled) {
          setSummary(summarizeRouterTokenStatus(nextStatus));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(EMPTY_ROUTER_TOKEN_STATUS_SUMMARY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [routerApiKey, selectedRouterToken]);

  return selectedRouterToken || routerApiKey
    ? summary
    : EMPTY_ROUTER_TOKEN_STATUS_SUMMARY;
}
