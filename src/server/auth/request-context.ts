import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { getSessionSecret } from "@/server/auth/secrets";
import { verifySessionToken, type AuthSession } from "@/server/auth/session";
import type { Database } from "@/server/db/client";
import { ensureDefaultScope } from "@/server/sync/meta-persistence";

/** Admin session from the request cookie, or null for unauthenticated callers. */
export async function getRequestSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token, getSessionSecret());
  } catch {
    return null;
  }
}

export type RequestAgencyContext = {
  agencyId: string;
  userId: string | null;
};

/**
 * Agency ownership for writes. Bootstrap sessions carry a placeholder agency
 * id that matches no database row, so scope always resolves through the
 * default agency scope (same as the Meta sync routes). The session is used
 * only for the audit actor, never for scoping — every query stays
 * agency-filtered, so cross-agency access is impossible by construction.
 */
export async function getRequestAgency(db: Database): Promise<RequestAgencyContext> {
  const session = await getRequestSession();
  const scope = await ensureDefaultScope(db);
  return { agencyId: scope.agencyId, userId: session?.user.id ?? null };
}
