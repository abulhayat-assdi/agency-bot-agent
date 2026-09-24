import { describe, expect, it } from "vitest";

import { isMockFallbackAllowed } from "./store";

describe("mock fallback policy", () => {
  it("allows mock data when the platform runs on the mock provider", () => {
    expect(isMockFallbackAllowed({})).toBe(true);
    expect(isMockFallbackAllowed({ META_PROVIDER: "mock" })).toBe(true);
    expect(isMockFallbackAllowed({ META_PROVIDER: "" })).toBe(true);
  });

  it("never mock-fills data with the live Graph API provider", () => {
    expect(isMockFallbackAllowed({ META_PROVIDER: "graph-api" })).toBe(false);
    expect(isMockFallbackAllowed({ META_PROVIDER: "graph-api", ANALYTICS_SOURCE: "db" })).toBe(false);
  });

  it("keeps an explicit mock analytics source as an opt-in demo override", () => {
    expect(isMockFallbackAllowed({ META_PROVIDER: "graph-api", ANALYTICS_SOURCE: "mock" })).toBe(true);
  });
});
