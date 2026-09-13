import { describe, expect, it, vi, afterEach } from "vitest";

import { logger, sanitizeLogUrl } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger secret redaction", () => {
  it.each([
    "access_token",
    "accessToken",
    "token",
    "META_SYSTEM_USER_ACCESS_TOKEN",
    "app_secret",
    "META_APP_SECRET",
    "authorization",
    "password",
    "api_key",
    "apiKey",
    "secret"
  ])("redacts sensitive key %s", (key) => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("test message", { [key]: "super-secret-value" });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("super-secret-value");
    expect(output).toContain("[redacted]");
  });

  it("redacts nested secrets and token query params", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("test", { nested: { apiKey: "hidden" } as unknown as string });
    expect(spy.mock.calls[0][0] as string).not.toContain("hidden");
    expect(sanitizeLogUrl("https://graph.facebook.com/v26.0/me?access_token=abc&fields=id")).not.toContain("abc");
  });

  it("never logs full request URLs with tokens", () => {
    expect(sanitizeLogUrl("/me?access_token=tok123")).toBe("/me?access_token=[redacted]");
  });
});
