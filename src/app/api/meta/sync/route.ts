import { NextResponse } from "next/server";
import { z } from "zod";

import { createConfiguredMetaAdsProvider, getMetaProviderReadiness } from "@/server/meta";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { InMemoryApiRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { syncAccount } from "@/server/sync/meta-sync";
import { ensureDefaultScope, runPersistedSync } from "@/server/sync/meta-persistence";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

const syncLimiter = new InMemoryApiRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const requestSchema = z.object({
  accountId: z.string().min(1).max(120),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeBreakdowns: z.boolean().optional()
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
  const range = parsed.data.since && parsed.data.until ? { since: parsed.data.since, until: parsed.data.until } : defaultRange(7);

  try {
    const provider = createConfiguredMetaAdsProvider();
    const providerMode = readiness.provider === "graph-api" ? "graph_api" : "mock";
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
