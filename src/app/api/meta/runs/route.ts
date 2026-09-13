import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/server/security/headers";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { ApiError, requireDb, resolveScope, runProgressView } from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET(request: Request) {
  try {
    const db = requireDb();
    const { agencyId } = await resolveScope(db);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100));
    const accountId = url.searchParams.get("accountId");
    const sync = new SyncRepository({ db, agencyId });
    const runs = await sync.latestRuns(accountId, limit);
    return jsonResponse({
      ok: true,
      runs: runs.map((run) =>
        runProgressView({
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
        })
      )
    });
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    logger.error("Sync runs listing failed", {});
    return jsonResponse({ ok: false, error: "Sync runs are unavailable" }, { status: 502 });
  }
}
