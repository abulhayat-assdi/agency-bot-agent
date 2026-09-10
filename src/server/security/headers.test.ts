import { describe, expect, it } from "vitest";

import { applySecurityHeaders, securityHeadersForEnvironment } from "@/server/security/headers";

describe("security headers", () => {
  it("sets browser hardening headers without frame blocking preview embeds", () => {
    const headers = securityHeadersForEnvironment({ APP_ENV: "development" });

    expect(headers).toEqual(expect.arrayContaining([{ key: "X-Content-Type-Options", value: "nosniff" }]));
    expect(headers.map((header) => header.key)).not.toContain("X-Frame-Options");
  });

  it("adds HSTS only in production", () => {
    expect(securityHeadersForEnvironment({ APP_ENV: "development" }).map((header) => header.key)).not.toContain("Strict-Transport-Security");
    expect(securityHeadersForEnvironment({ APP_ENV: "production" }).map((header) => header.key)).toContain("Strict-Transport-Security");
  });

  it("applies headers to route responses", () => {
    const headers = applySecurityHeaders(new Headers(), { APP_ENV: "test" });

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
