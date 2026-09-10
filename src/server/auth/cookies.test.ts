import { describe, expect, it } from "vitest";

import { getSessionCookieOptions } from "@/server/auth/cookies";

describe("session cookie options", () => {
  it("uses same-site lax cookies by default", () => {
    expect(getSessionCookieOptions({ APP_ENV: "development" })).toMatchObject({
      secure: false,
      sameSite: "lax",
      httpOnly: true
    });
  });

  it("supports secure cross-site cookies for embedded preview environments", () => {
    expect(getSessionCookieOptions({ APP_ENV: "development", PREVIEW_CROSS_SITE_COOKIES: "true" })).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true
    });
  });
});
