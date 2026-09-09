import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import { SESSION_DURATION_SECONDS } from "@/server/auth/constants";

export function getSessionCookieOptions(env: Record<string, string | undefined> = process.env): Partial<ResponseCookie> {
  const secure = env.APP_ENV === "production" || env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS
  };
}

export function getExpiredSessionCookieOptions(env: Record<string, string | undefined> = process.env): Partial<ResponseCookie> {
  return {
    ...getSessionCookieOptions(env),
    maxAge: 0
  };
}
