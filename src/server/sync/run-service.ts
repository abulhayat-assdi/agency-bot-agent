import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { getDatabase } from "@/server/db/client";
import { adAccounts } from "@/server/db/schema";
import { createConfiguredMetaAdsProvider } from "@/server/meta";
import type { MetaAdsProvider } from "@/server/meta/types";
import { MetricsRepository } from "@/server/repositories/metrics-repository";
import { SyncRepository } from "@/server/repositories/sync-repository";
import {
  checkpointSummary,
  createCheckpoint,
  pendingChunks,
  remediationForKind,
  type ChunkCheckpoint,
  type SyncKind
} from "@/server/sync/chunks";
import { ensureDefaultScope } from "@/server/sync/meta-persistence";
import { isRunStale, staleRunRemediation } from "@/server/sync/run-health";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function requireDb(): Database {
  try {
    return getDatabase();
  } catch {
    throw new ApiError(503, "Database is not configured for sync operations");
  }
}

export function requireProvider(): MetaAdsProvider {
  try {
    return createConfiguredMetaAdsProvider();
  } catch {
    throw new ApiError(503, "Meta provider is not configured");
  }
}

export async function resolveScope(db: Database) {
  try {
    return await ensureDefaultScope(db);
  } catch {
    throw new ApiError(503, "No agency scope available for sync operations");
  }
}

export type AccountContext = {
  metaAccountId: string;
  dbRowId: string | null;
  name: string;
  currency: string;
  timezone: string;
  accessStatus: string;
};

/** Validate the account against the provider (source of truth for access), enriched with DB state when present. */
export async function resolveAccountContext(db: Database, provider: MetaAdsProvider, accountId: string): Promise<AccountContext> {
  const providerAccount = await provider.getAdAccount(accountId).catch(() => null);
  if (!providerAccount) throw new ApiError(404, "Ad account was not returned by the Meta provider");
  const row = await db.query.adAccounts.findFirst({
    where: and(eq(adAccounts.metaAccountId, providerAccount.accountId), isNull(adAccounts.archivedAt))
  });
  return {
    metaAccountId: providerAccount.id,
    dbRowId: row?.id ?? null,
    name: providerAccount.name,
    currency: providerAccount.currency,
    timezone: providerAccount.timezone,
    accessStatus: providerAccount.accessStatus
  };
}

export async function createParentRun(
  db: Database,
  agencyId: string,
  input: {
    adAccountId: string | null;
    providerMode: "mock" | "graph_api";
    type: "scheduled" | "manual" | "backfill" | "incremental";
    metaAccountId: string;
    syncKind: SyncKind;
    since: string;
    until: string;
    chunkDays: number;
    timezone: string;
    requestedByUserId?: string;
    includeBreakdowns?: boolean;
  }
) {
  const sync = new SyncRepository({ db, agencyId });
  const checkpoint = createCheckpoint(input.metaAccountId, input.syncKind, input.since, input.until, input.chunkDays, input.timezone);
  const run = await sync.startRun(
    {
      adAccountId: input.adAccountId,
      providerMode: input.providerMode,
      type: input.type,
      requestedByUserId: input.requestedByUserId,
      checkpoint: { ...checkpoint, includeBreakdowns: input.includeBreakdowns ?? true },
      stats: { chunks: checkpointSummary(checkpoint) }
    },
    "queued"
  );
  return { run, checkpoint };
}

export function runProgressView(run: {
  id: string;
  status: string;
  type: string;
  adAccountId: string | null;
  checkpoint: unknown;
  stats: unknown;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
  errorSummary: string | null;
}, now: Date = new Date()) {
  const checkpoint = (run.checkpoint ?? {}) as Partial<ChunkCheckpoint>;
  const chunks = Array.isArray(checkpoint.chunks) ? checkpoint.chunks.length : 0;
  const completed = Array.isArray(checkpoint.completedChunks) ? checkpoint.completedChunks.length : 0;
  const failed = Array.isArray(checkpoint.failedChunks) ? checkpoint.failedChunks : [];
  const started = run.startedAt ? new Date(run.startedAt).toISOString() : null;
  const finished = run.finishedAt ? new Date(run.finishedAt).toISOString() : null;
  const stale = isRunStale({ status: run.status, startedAt: run.startedAt, createdAt: run.createdAt }, now);
  return {
    runId: run.id,
    status: run.status,
    type: run.type,
    adAccountId: run.adAccountId,
    stale,
    staleRemediation: stale ? staleRunRemediation() : null,
    checkpoint: checkpoint.metaAccountId
      ? {
          metaAccountId: checkpoint.metaAccountId,
          syncKind: checkpoint.syncKind,
          requestedSince: checkpoint.requestedSince,
          requestedUntil: checkpoint.requestedUntil,
          timezone: checkpoint.timezone,
          totalChunks: chunks,
          completedChunks: completed,
          failedChunks: failed,
          pendingChunks: chunks - completed,
          currentChunk: checkpoint.currentChunk ?? null,
          lastCheckpointAt: checkpoint.lastCheckpointAt ?? null
        }
      : null,
    stats: run.stats ?? {},
    startedAt: started,
    finishedAt: finished,
    durationMs: started && finished ? new Date(finished).getTime() - new Date(started).getTime() : null,
    errorSummary: run.errorSummary
  };
}

export async function runErrorsWithRemediation(db: Database, agencyId: string, runId: string) {
  const sync = new SyncRepository({ db, agencyId });
  const errors = await sync.errorsForRun(runId);
  return errors.map((error) => {
    const kind = (error.requestContext as { kind?: string } | null)?.kind ?? error.providerCode ?? "unknown";
    return {
      id: error.id,
      stage: (error.requestContext as { stage?: string } | null)?.stage ?? null,
      chunkIndex: (error.requestContext as { chunkIndex?: number } | null)?.chunkIndex ?? null,
      category: kind,
      safeMessage: error.safeMessage,
      remediation: remediationForKind(kind),
      retryable: error.retryable,
      severity: error.severity,
      occurredAt: error.occurredAt.toISOString()
    };
  });
}

export type AccountFreshness = {
  metaAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accessStatus: string;
  connected: boolean;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastSyncStatus: string | null;
  dataThroughDate: string | null;
  errorState: { category: string; safeMessage: string; remediation: string } | null;
};

export async function accountFreshnessList(db: Database, agencyId: string): Promise<AccountFreshness[]> {
  const rows = await db.query.adAccounts.findMany({ where: isNull(adAccounts.archivedAt), limit: 200 });
  const sync = new SyncRepository({ db, agencyId });
  const freshness: AccountFreshness[] = [];
  for (const row of rows) {
    const runs = await sync.latestRuns(row.id, 5);
    const latest = runs[0];
    const errors = latest ? await sync.errorsForRun(latest.id).catch(() => []) : [];
    const through = await dataThroughDate(db, row.id);
    const latestError = errors[0];
    const kind = latestError ? ((latestError.requestContext as { kind?: string } | null)?.kind ?? latestError.providerCode ?? "unknown") : null;
    freshness.push({
      metaAccountId: `act_${row.metaAccountId}`,
      name: row.name,
      currency: row.currency,
      timezone: row.timezone,
      accessStatus: row.accessStatus,
      connected: row.accessStatus === "connected",
      lastSuccessfulSync: row.lastSuccessfulSyncAt ? row.lastSuccessfulSyncAt.toISOString() : null,
      lastAttemptedSync: latest ? new Date(latest.createdAt).toISOString() : null,
      lastSyncStatus: latest?.status ?? row.lastSyncState ?? null,
      dataThroughDate: through,
      errorState: latestError
        ? { category: kind ?? "unknown", safeMessage: latestError.safeMessage, remediation: remediationForKind(kind ?? "unknown") }
        : null
    });
  }
  return freshness;
}

async function dataThroughDate(db: Database, adAccountId: string): Promise<string | null> {
  const metrics = new MetricsRepository({ db, agencyId: "" });
  return metrics.maxDailyDate(adAccountId, "account").catch(() => null);
}

export function isCheckpoint(value: unknown): value is ChunkCheckpoint {
  const checkpoint = value as ChunkCheckpoint | undefined;
  return Boolean(checkpoint) && checkpoint?.version === 1 && Array.isArray(checkpoint?.chunks);
}

export { pendingChunks };
