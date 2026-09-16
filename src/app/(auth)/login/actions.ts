"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { parseLoginInput, validateAdminCredentials } from "@/server/auth/credentials";
import { getSessionCookieOptions } from "@/server/auth/cookies";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/server/auth/rate-limit";
import { createSessionToken } from "@/server/auth/session";
import { auditLogSafe, auditRequestHashes } from "@/server/audit/audit-log";
import { getDatabase } from "@/server/db/client";
import { ensureDefaultScope } from "@/server/sync/meta-persistence";
import { logger } from "@/server/observability/logger";

export type LoginFormState = {
  error?: string;
};

function getClientKey(email: string, headerValues: Headers) {
  const forwardedFor = headerValues.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerValues.get("x-real-ip");
  return `${email}:${forwardedFor || realIp || "unknown"}`;
}

export async function loginAction(_previousState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = parseLoginInput({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Enter a valid admin email and password." };
  }

  const headerValues = await headers();
  const rateLimitKey = getClientKey(parsed.data.email, headerValues);
  const rateLimit = await checkLoginRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    logger.warn("login rate limit exceeded", { email: parsed.data.email });
    return { error: "Too many login attempts. Try again later." };
  }

  const user = await validateAdminCredentials(parsed.data);

  if (!user) {
    logger.warn("admin login failed", { email: parsed.data.email });
    await auditAuthEvent("admin.login.failure", null, parsed.data.email, headerValues);
    return { error: "Invalid admin credentials." };
  }

  await resetLoginRateLimit(rateLimitKey);

  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  logger.info("admin login succeeded", { email: user.email, userId: user.id });
  await auditAuthEvent("admin.login.success", user.id, user.email, headerValues);
  redirect("/dashboard");
}

async function auditAuthEvent(
  action: "admin.login.success" | "admin.login.failure",
  userId: string | null,
  email: string,
  headerValues: Headers
) {
  try {
    const db = getDatabase();
    const { agencyId } = await ensureDefaultScope(db);
    const request = { headers: headerValues } as Request;
    const { ipHash, userAgentHash } = auditRequestHashes(request);
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action,
      resourceType: "admin_user",
      resourceId: null,
      metadata: { email },
      ipHash,
      userAgentHash
    });
  } catch {
    // Audit side-channel must never break authentication.
  }
}
