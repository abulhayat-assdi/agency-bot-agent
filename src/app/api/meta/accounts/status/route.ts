import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/server/security/headers";
import { ApiError, accountFreshnessList, requireDb, resolveScope } from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET() {
  try {
    const db = requireDb();
    const { agencyId } = await resolveScope(db);
    const accounts = await accountFreshnessList(db, agencyId);
    return jsonResponse({ ok: true, accounts });
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    logger.error("Account sync status failed", {});
    return jsonResponse({ ok: false, error: "Account sync status is unavailable" }, { status: 502 });
  }
}
