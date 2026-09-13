import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/server/security/headers";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { ApiError, requireDb, resolveScope } from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

/** Cooperative cancellation: queued/running/partial runs stop picking up new chunks. */
export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const db = requireDb();
    const { agencyId } = await resolveScope(db);
    const sync = new SyncRepository({ db, agencyId });
    const run = await sync.findRun(runId);
    if (!run) return jsonResponse({ ok: false, error: "Sync run not found" }, { status: 404 });
    if (run.status === "success" || run.status === "failed" || run.status === "cancelled") {
      return jsonResponse({ ok: false, error: `Run is already ${run.status}` }, { status: 409 });
    }
    await sync.markCancelled(runId);
    logger.info("Sync run cancelled by admin", { runId });
    return jsonResponse({ ok: true, runId, status: "cancelled" });
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    logger.error("Sync run cancellation failed", {});
    return jsonResponse({ ok: false, error: "Sync run cancellation failed" }, { status: 502 });
  }
}
