import { getAppConfig } from "@/server/config/env";
import { createMockMetaAdsProvider } from "@/server/meta/adapters/mock/mock-meta-provider";
import { createGraphApiMetaAdsProvider } from "@/server/meta/adapters/graph-api/graph-api-provider";
import type { MetaAdsProvider } from "@/server/meta/types";

export function createConfiguredMetaAdsProvider(env: Record<string, string | undefined> = process.env): MetaAdsProvider {
  const config = getAppConfig(env);

  if (config.META_PROVIDER === "mock") return createMockMetaAdsProvider();

  if (!config.META_SYSTEM_USER_ACCESS_TOKEN) {
    throw new Error("META_SYSTEM_USER_ACCESS_TOKEN is required when META_PROVIDER=graph-api");
  }

  return createGraphApiMetaAdsProvider({
    accessToken: config.META_SYSTEM_USER_ACCESS_TOKEN,
    appSecret: config.META_APP_SECRET,
    graphApiVersion: config.META_GRAPH_API_VERSION
  });
}

export function getMetaProviderReadiness(env: Record<string, string | undefined> = process.env) {
  const config = getAppConfig(env);
  return {
    provider: config.META_PROVIDER,
    graphApiVersion: config.META_GRAPH_API_VERSION,
    configured: config.META_PROVIDER === "mock" || Boolean(config.META_SYSTEM_USER_ACCESS_TOKEN),
    tokenConfigured: Boolean(config.META_SYSTEM_USER_ACCESS_TOKEN),
    appSecretConfigured: Boolean(config.META_APP_SECRET),
    readOnlyPermission: "ads_read",
    writePermissionsRequested: false
  };
}
