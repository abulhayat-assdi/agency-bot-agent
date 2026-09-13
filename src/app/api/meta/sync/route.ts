import { NextResponse } from "next/server";
import { z } from "zod";

import { createConfiguredMetaAdsProvider, getMetaProviderReadiness } from "@/server/meta";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { InMemoryApiRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { syncAccount } from "@/server/sync/meta-sync";
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
    const result = await syncAccount(provider, parsed.data.accountId, range, {}, {
      providerName: readiness.provider === "graph-api" ? "graph-api" : "mock",
      apiVersion: readiness.graphApiVersion,
      includeBreakdowns: parsed.data.includeBreakdowns ?? false
    });
    logger.info("Meta account sync requested via admin API", { accountId: parsed.data.accountId, status: result.status });
    return jsonResponse({
      ok: result.status !== "failed",
      status: result.status,
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
