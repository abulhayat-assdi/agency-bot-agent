import { describe, expect, it } from "vitest";

import { getAppConfig, getRuntimeReadiness } from "./env";

describe("environment configuration", () => {
  it("uses safe defaults for local foundation development", () => {
    const config = getAppConfig({});

    expect(config.APP_ENV).toBe("development");
    expect(config.META_PROVIDER).toBe("mock");
    expect(config.META_GRAPH_API_VERSION).toBe("v26.0");
  });

  it("reports readiness without exposing secrets", () => {
    const config = getAppConfig({
      META_PROVIDER: "mock",
      EMAIL_PROVIDER: "mock",
      OPENAI_API_KEY: "test-openai-key"
    });

    expect(getRuntimeReadiness(config)).toEqual(
      expect.objectContaining({
        app: true,
        metaConfigured: true,
        aiConfigured: true,
        emailConfigured: true
      })
    );
  });
});
