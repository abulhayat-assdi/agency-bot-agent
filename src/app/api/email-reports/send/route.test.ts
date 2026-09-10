import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/email-reports/send/route";
import { emailSendRateLimiter } from "@/server/security/api-rate-limit";

function request(body: unknown, ip = "203.0.113.60") {
  return new Request("https://example.test/api/email-reports/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify(body)
  });
}

describe("email report send API route", () => {
  beforeEach(() => emailSendRateLimiter.clear());

  it("rejects invalid payloads with security headers", async () => {
    const response = await POST(request({ reportId: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns not found for unknown report IDs", async () => {
    const response = await POST(request({ reportId: "missing" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Email report not found");
  });

  it("rate limits repeated send attempts", async () => {
    let response = await POST(request({ reportId: "email_report_paused_ad" }, "198.51.100.8"));
    expect(response.status).toBe(200);

    for (let index = 0; index < 10; index += 1) {
      response = await POST(request({ reportId: "email_report_paused_ad" }, "198.51.100.8"));
    }

    expect(response.status).toBe(429);
  });
});
