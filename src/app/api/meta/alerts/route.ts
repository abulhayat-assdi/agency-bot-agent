import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/server/security/headers";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { evaluateRunAlerts, logAlertEvents } from "@/server/sync/alerts";
import { ApiError, requireDb, resolveScope, runErrorsWithRemediation } from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

/**
 * Minimal production alert surface derived from persisted sync state.
 * Structured events are also logged for external providers to consume.
 */
export async function GET(request: Request) {
  try {
    const db = requireDb();
    const { agencyId } = await resolveScope(db);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100));
    const sync = new SyncRepository({ db, agencyId });
    const [recent, running] = await Promise.all([sync.latestRuns(null, limit), sync.findRunning(50)]);
    const ids = new Map(recent.map((run) => [run.id, run]));
    for (const run of running) {
      if (!ids.has(run.id)) ids.set(run.id, run);
    }
    const runs = [...ids.values()];
    const errorsByRunId: Record<string, Array<{ category: string; safeMessage: string; retryable: boolean }>> = {};
    for (const run of runs) {
      const errors = await runErrorsWithRemediation(db, agencyId, run.id).catch(() => []);
      errorsByRunId[run.id] = errors.map((error) => ({ category: error.category, safeMessage: error.safeMessage, retryable: error.retryable }));
    }
    const events = evaluateRunAlerts(
      runs.map((run) => ({
        id: run.id,
        status: run.status,
        type: run.type,
        errorSummary: run.errorSummary,
        checkpoint: run.checkpoint,
        startedAt: run.startedAt,
        createdAt: run.createdAt
      })),
      errorsByRunId
    );
    if (events.length > 0) logAlertEvents(events);
    return jsonResponse({ ok: true, alerts: events });
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    logger.error("Sync alerts unavailable", {});
    return jsonResponse({ ok: false, error: "Sync alerts are unavailable" }, { status: 502 });
  }
}
