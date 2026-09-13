import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createConfiguredMetaAdsProvider, getMetaProviderReadiness } from "@/server/meta";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { InMemoryApiRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { getAppConfig } from "@/server/config/env";
import { enqueueBackfillPlanner } from "@/server/jobs/queues";
import { checkpointSummary, pendingChunks } from "@/server/sync/chunks";
import { syncAccount } from "@/server/sync/meta-sync";
import { ensureDefaultScope, runPersistedSync } from "@/server/sync/meta-persistence";
import { ApiError, createParentRun, resolveAccountContext } from "@/server/sync/run-service";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

const syncLimiter = new InMemoryApiRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const requestSchema = z.object({
  accountId: z.string().min(1).max(120),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeBreakdowns: z.boolean().optional(),
  // When false (and the queue is configured), the sync is enqueued instead of
  // running inside the request lifecycle. Defaults to queueing.
  inline: z.boolean().optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

function defaultRange(days = 7) {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

export async function POST(request: Request) {
  const rateLimit = syncLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ ok: false, error: "Meta sync rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid Meta sync request" }, { status: 400 });
  }

  const readiness = getMetaProviderReadiness();
  const config = getAppConfig();
  const range = parsed.data.since && parsed.data.until ? { since: parsed.data.since, until: parsed.data.until } : defaultRange(7);

  try {
    const provider = createConfiguredMetaAdsProvider();
    const providerMode = readiness.provider === "graph-api" ? "graph_api" : "mock";

    // Production path: enqueue a chunked manual sync so large ranges never
    // block the HTTP request. Inline remains for small/dev syncs and tests.
    if (config.REDIS_URL && parsed.data.inline !== true) {
      const db = getDatabase();
      const { agencyId } = await ensureDefaultScope(db);
      const account = await resolveAccountContext(db, provider, parsed.data.accountId);
      const { run, checkpoint } = await createParentRun(db, agencyId, {
        adAccountId: account.dbRowId,
        providerMode,
        type: "manual",
        metaAccountId: account.metaAccountId,
        syncKind: "manual",
        since: range.since,
        until: range.until,
        chunkDays: config.BACKFILL_CHUNK_DAYS,
        timezone: account.timezone,
        includeBreakdowns: parsed.data.includeBreakdowns ?? true
      });
      const job = await enqueueBackfillPlanner({
        agencyId,
        accountId: account.metaAccountId,
        parentRunId: run.id,
        dateStart: range.since,
        dateEnd: range.until,
        timezone: account.timezone,
        syncKind: "manual",
        syncType: "manual",
        chunkDays: config.BACKFILL_CHUNK_DAYS,
        includeBreakdowns: parsed.data.includeBreakdowns ?? true,
        traceId: randomUUID()
      });
      logger.info("Manual sync enqueued via admin API", { accountId: account.metaAccountId, runId: run.id });
      const summary = checkpointSummary(checkpoint);
      return jsonResponse({
        ok: true,
        status: "queued",
        queued: true,
        persisted: true,
        runId: run.id,
        jobId: job.id ?? null,
        account: { id: account.metaAccountId, name: account.name, currency: account.currency, timezone: account.timezone, accessStatus: account.accessStatus },
        stages: [],
        totalChunks: summary.totalChunks,
        pendingChunks: pendingChunks(checkpoint).length,
        availabilityCount: 0,
        rawRecords: 0
      });
    }

    const persisted = await runPersistedSyncIfConfigured(provider, parsed.data.accountId, range, {
      providerMode,
      apiVersion: readiness.graphApiVersion,
      includeBreakdowns: parsed.data.includeBreakdowns ?? false
    });
    const result = persisted.result;
    logger.info("Meta account sync requested via admin API", {
      accountId: parsed.data.accountId,
      status: result.status,
      persisted: persisted.persisted,
      runId: persisted.runId
    });
    return jsonResponse({
      ok: result.status !== "failed",
      status: result.status,
      queued: false,
      persisted: persisted.persisted,
      runId: persisted.runId,
      account: result.account
        ? { id: result.account.id, name: result.account.name, currency: result.account.currency, timezone: result.account.timezone, accessStatus: result.account.accessStatus }
        : null,
      stages: result.stages.map((stage) => ({ stage: stage.stage, scanned: stage.scanned, rawRecords: stage.rawRecords, errors: stage.errors })),
      availabilityCount: result.availability.length,
      rawRecords: result.rawRecords.length
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ ok: false, error: error.message }, { status: error.status });
    }
    logger.error("Meta account sync failed", { accountId: parsed.data.accountId });
    return jsonResponse({ ok: false, error: toSafeUserMessage(error) }, { status: 502 });
  }
}

async function runPersistedSyncIfConfigured(
  provider: ReturnType<typeof createConfiguredMetaAdsProvider>,
  accountId: string,
  range: { since: string; until: string },
  scope: { providerMode: "mock" | "graph_api"; apiVersion: string; includeBreakdowns: boolean }
) {
  try {
    const db = getDatabase();
    const { agencyId, clientId } = await ensureDefaultScope(db);
    const { result, runId } = await runPersistedSync(db, provider, accountId, range, { agencyId, clientId, ...scope }, { includeBreakdowns: scope.includeBreakdowns });
    return { result, runId, persisted: true as const };
  } catch (error) {
    if (error instanceof Error && /DATABASE_URL|No agency available/.test(error.message)) {
      // No database configured: preserve the M4 in-memory sync behavior.
      const result = await syncAccount(provider, accountId, range, {}, {
        providerName: scope.providerMode === "graph_api" ? "graph-api" : "mock",
        apiVersion: scope.apiVersion,
        includeBreakdowns: scope.includeBreakdowns
      });
      return { result, runId: null as string | null, persisted: false as const };
    }
    throw error;
  }
}
