import { describe, expect, it } from "vitest";

import { getMetaProviderReadiness } from "@/server/meta";
import { createConfiguredMetaAdsProvider } from "@/server/meta/provider-factory";

describe("Meta provider factory hardening", () => {
  it("reports live readiness without exposing credentials", () => {
    const readiness = getMetaProviderReadiness({
      APP_ENV: "test",
      META_PROVIDER: "graph-api",
      META_GRAPH_API_VERSION: "v26.0",
      META_SYSTEM_USER_ACCESS_TOKEN: "secret-token",
      META_APP_SECRET: "secret-app"
    });

    expect(readiness).toEqual({
      provider: "graph-api",
      graphApiVersion: "v26.0",
      configured: true,
      tokenConfigured: true,
      appSecretConfigured: true,
      readOnlyPermission: "ads_read",
      writePermissionsRequested: false
    });
    expect(JSON.stringify(readiness)).not.toContain("secret-token");
    expect(JSON.stringify(readiness)).not.toContain("secret-app");
  });

  it("fails fast when live mode has no system user token", () => {
    expect(() =>
      createConfiguredMetaAdsProvider({
        APP_ENV: "test",
        META_PROVIDER: "graph-api",
        META_GRAPH_API_VERSION: "v26.0"
      })
    ).toThrow("META_SYSTEM_USER_ACCESS_TOKEN is required");
  });
});
