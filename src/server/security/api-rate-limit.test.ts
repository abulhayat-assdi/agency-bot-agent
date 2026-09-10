import { describe, expect, it } from "vitest";

import { getClientIp, InMemoryApiRateLimiter, rateLimitHeaders } from "@/server/security/api-rate-limit";

describe("API rate limiting", () => {
  it("limits requests inside a fixed window and resets after expiry", () => {
    const limiter = new InMemoryApiRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.check("actor", 1_000).allowed).toBe(true);
    expect(limiter.check("actor", 1_100).allowed).toBe(true);
    const blocked = limiter.check("actor", 1_200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("actor", 2_001).allowed).toBe(true);
  });

  it("extracts client IP from trusted forwarding headers", () => {
    const request = new Request("https://example.test/api", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" }
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("returns safe rate-limit headers", () => {
    const limiter = new InMemoryApiRateLimiter({ limit: 1, windowMs: 60_000 });
    const result = limiter.check("actor", Date.parse("2026-09-10T00:00:00.000Z"));

    expect(rateLimitHeaders(result)).toEqual({
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "2026-09-10T00:01:00.000Z",
      "Retry-After": "60"
    });
  });
});
