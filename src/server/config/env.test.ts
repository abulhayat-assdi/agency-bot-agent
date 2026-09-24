import { describe, expect, it } from "vitest";

import { getAppConfig, getRuntimeReadiness } from "./env";

describe("environment configuration", () => {
  it("uses safe defaults for local foundation development", () => {
    const config = getAppConfig({});

    expect(config.APP_ENV).toBe("development");
    expect(config.META_PROVIDER).toBe("mock");
    expect(config.META_GRAPH_API_VERSION).toBe("v26.0");
  });

  it("treats empty compose-interpolated values as unset", () => {
    const config = getAppConfig({ EMAIL_FROM: "", OPENAI_BASE_URL: "", OPENAI_MODEL: "" });

    expect(config.EMAIL_FROM).toBeUndefined();
    expect(config.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(config.OPENAI_MODEL).toBe("gpt-4.1-mini");
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
        authConfigured: false,
        metaConfigured: true,
        aiConfigured: true,
        emailConfigured: true
      })
    );
  });
});
