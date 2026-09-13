import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppConfig } from "@/server/config/env";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { getSharedRateLimiter } from "@/server/security/redis-rate-limit";
import { enqueueBackfillPlanner } from "@/server/jobs/queues";
import { checkpointSummary, pendingChunks } from "@/server/sync/chunks";
import { SyncRepository } from "@/server/repositories/sync-repository";
import {
  ApiError,
  createParentRun,
  requireDb,
  requireProvider,
  resolveAccountContext,
  resolveScope
} from "@/server/sync/run-service";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

const limiter = getSharedRateLimiter("meta-backfill", { limit: 10, windowMs: 10 * 60_000 });

const requestSchema = z.object({
  accountId: z.string().min(1).max(120),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  syncKind: z.enum(["initial", "incremental", "backfill", "manual"]).default("backfill"),
  chunkDays: z.number().int().min(1).max(31).optional(),
  includeBreakdowns: z.boolean().optional(),
  resumeRunId: z.string().uuid().optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function POST(request: Request) {
  const rateLimit = await limiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ ok: false, error: "Backfill rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid backfill request" }, { status: 400 });
  }

  try {
    const config = getAppConfig();
    if (!config.REDIS_URL) {
      return jsonResponse({ ok: false, error: "Sync queue is not configured (REDIS_URL missing)" }, { status: 503 });
    }
    const db = requireDb();
    const provider = requireProvider();
    const { agencyId } = await resolveScope(db);
    const account = await resolveAccountContext(db, provider, parsed.data.accountId);
    const chunkDays = parsed.data.chunkDays ?? config.BACKFILL_CHUNK_DAYS;
    const providerMode = config.META_PROVIDER === "graph-api" ? "graph_api" : "mock";

    // Resume: reuse the existing parent run; the planner skips completed chunks.
    if (parsed.data.resumeRunId) {
      const sync = new SyncRepository({ db, agencyId });
      const existing = await sync.findRun(parsed.data.resumeRunId);
      if (!existing) return jsonResponse({ ok: false, error: "Sync run not found" }, { status: 404 });
      if (existing.status === "cancelled" || existing.status === "success") {
        return jsonResponse({ ok: false, error: `Run cannot be resumed from status ${existing.status}` }, { status: 409 });
      }
      await sync.markRunning(existing.id).catch(() => undefined);
      const job = await enqueueBackfillPlanner({
        agencyId,
        accountId: account.metaAccountId,
        parentRunId: existing.id,
        dateStart: parsed.data.dateStart,
        dateEnd: parsed.data.dateEnd,
        timezone: account.timezone,
        syncKind: parsed.data.syncKind,
        syncType: "backfill",
        chunkDays,
        includeBreakdowns: parsed.data.includeBreakdowns ?? true,
        traceId: existing.id
      });
      logger.info("Backfill resume enqueued", { parentRunId: existing.id, accountId: account.metaAccountId });
      return jsonResponse({ ok: true, runId: existing.id, jobId: job.id ?? null, resumed: true });
    }

    const { run, checkpoint } = await createParentRun(db, agencyId, {
      adAccountId: account.dbRowId,
      providerMode,
      type: "backfill",
      metaAccountId: account.metaAccountId,
      syncKind: parsed.data.syncKind,
      since: parsed.data.dateStart,
      until: parsed.data.dateEnd,
      chunkDays,
      timezone: account.timezone,
      includeBreakdowns: parsed.data.includeBreakdowns ?? true
    });

    const job = await enqueueBackfillPlanner({
      agencyId,
      accountId: account.metaAccountId,
      parentRunId: run.id,
      dateStart: parsed.data.dateStart,
      dateEnd: parsed.data.dateEnd,
      timezone: account.timezone,
      syncKind: parsed.data.syncKind,
      syncType: "backfill",
      chunkDays,
      includeBreakdowns: parsed.data.includeBreakdowns ?? true,
      traceId: run.id
    });

    logger.info("Backfill enqueued", { parentRunId: run.id, accountId: account.metaAccountId, totalChunks: checkpoint.chunks.length });
    const summary = checkpointSummary(checkpoint);
    return jsonResponse({
      ok: true,
      runId: run.id,
      jobId: job.id ?? null,
      status: "queued",
      totalChunks: summary.totalChunks,
      pendingChunks: pendingChunks(checkpoint).length
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof Error && /exceeds the .* backfill limit|Invalid date/.test(error.message)) {
      return jsonResponse({ ok: false, error: error.message }, { status: 400 });
    }
    logger.error("Backfill enqueue failed", { error: toSafeUserMessage(error) });
    return jsonResponse({ ok: false, error: toSafeUserMessage(error) }, { status: 502 });
  }
}
