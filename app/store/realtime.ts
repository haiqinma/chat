import { ServiceProvider } from "../constant";
import type { Voice } from "rt-client";

export type RealtimeProvider = ServiceProvider.OpenAI | ServiceProvider.Azure;

export type RealtimeConfig = {
  enabled: boolean;
  provider: RealtimeProvider;
  model: string;
  apiKey: string;
  azure: {
    endpoint: string;
    deployment: string;
  };
  temperature: number;
  voice: Voice;
};

export type LegacyRealtimeConfig = Partial<RealtimeConfig> & {
  enable?: boolean;
};

export function createDefaultRealtimeConfig(
  override?: LegacyRealtimeConfig,
): RealtimeConfig {
  const { enable, azure, ...rest } = override ?? {};
  const defaultConfig: RealtimeConfig = {
    enabled: false,
    provider: ServiceProvider.OpenAI,
    model: "gpt-4o-realtime-preview-2024-10-01",
    apiKey: "",
    azure: {
      endpoint: "",
      deployment: "",
    },
    temperature: 0.9,
    voice: "alloy" as Voice,
  };

  return {
    ...defaultConfig,
    ...rest,
    enabled: rest.enabled ?? enable ?? false,
    azure: {
      endpoint: azure?.endpoint ?? "",
      deployment: azure?.deployment ?? "",
    },
  };
}
