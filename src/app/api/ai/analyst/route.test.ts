import { describe, expect, it, beforeEach } from "vitest";

import { POST } from "@/app/api/ai/analyst/route";
import { aiAnalystRateLimiter } from "@/server/security/api-rate-limit";

function request(body: unknown, ip = "203.0.113.50") {
  return new Request("https://example.test/api/ai/analyst", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify(body)
  });
}

describe("AI analyst API route", () => {
  beforeEach(() => aiAnalystRateLimiter.clear());

  it("rejects invalid payloads with hardened response headers", async () => {
    const response = await POST(request({ question: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns grounded evidence for valid prompts", async () => {
    const response = await POST(request({ question: "Summarize performance", accountId: "act_100000000000001", preset: "last_7_days" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.context.evidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });

  it("rate limits excessive requests by IP", async () => {
    let response = await POST(request({ question: "Summarize performance" }, "198.51.100.7"));
    expect(response.status).toBe(200);

    for (let index = 0; index < 30; index += 1) {
      response = await POST(request({ question: "Summarize performance" }, "198.51.100.7"));
    }

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
