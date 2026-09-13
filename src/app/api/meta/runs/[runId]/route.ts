import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/server/security/headers";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { ApiError, requireDb, resolveScope, runErrorsWithRemediation, runProgressView } from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const db = requireDb();
    const { agencyId } = await resolveScope(db);
    const sync = new SyncRepository({ db, agencyId });
    const run = await sync.findRun(runId);
    if (!run) return jsonResponse({ ok: false, error: "Sync run not found" }, { status: 404 });
    const errors = await runErrorsWithRemediation(db, agencyId, run.id);
    return jsonResponse({
      ok: true,
      run: runProgressView({
        id: run.id,
        status: run.status,
        type: run.type,
        adAccountId: run.adAccountId,
        checkpoint: run.checkpoint,
        stats: run.stats,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        createdAt: run.createdAt,
        errorSummary: run.errorSummary
      }),
      errors
    });
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    logger.error("Sync run detail failed", {});
    return jsonResponse({ ok: false, error: "Sync run is unavailable" }, { status: 502 });
  }
}
