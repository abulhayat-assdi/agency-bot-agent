import { UnrecoverableError, Worker, type Job } from "bullmq";

import { resolveDatePreset } from "@/lib/dates/reporting";
import { getAppConfig } from "@/server/config/env";
import { getDatabase, type Database } from "@/server/db/client";
import { MetaApiError, toSafeUserMessage } from "@/server/meta/errors";
import { createGraphApiMetaAdsProvider, createMockMetaAdsProvider } from "@/server/meta";
import { fetchAllPagesBounded } from "@/server/meta/pagination";
import type { MetaAdsProvider, MetaBreakdownRow, MetaDateRange, MetaEntityLevel, MetaInsightRow, MetaPage, MetaPaging } from "@/server/meta/types";
import { logger } from "@/server/observability/logger";
import { auditLogSafe } from "@/server/audit/audit-log";
import { createRedisConnection } from "@/server/jobs/redis";
import { enqueueAccountChunkSync } from "@/server/jobs/queues";
import {
  SYNC_ACCOUNT_CHUNK_JOB,
  SYNC_AD_ACCOUNT_JOB,
  SYNC_BACKFILL_PLANNER_JOB,
  SYNC_QUEUE_NAME,
  type SyncAccountChunkJobData,
  type SyncAdAccountJobData,
  type SyncAllAccountsJobData,
  type SyncBackfillPlannerJobData,
  type SyncJobResult,
  type SyncQueueJobData
} from "@/server/jobs/types";
import { SyncRepository } from "@/server/repositories/sync-repository";
import {
  assertPayloadHasNoSecrets,
  backoffDelayMs,
  backfillPlannerPayloadSchema,
  chunkJobPayloadSchema,
  createCheckpoint,
  markChunkComplete,
  markChunkFailed,
  pendingChunks,
  checkpointSummary,
  retryDecisionForKind,
  type ChunkCheckpoint,
  type SyncKind
} from "@/server/sync/chunks";
import { ensureDefaultScope, runPersistedSync } from "@/server/sync/meta-persistence";
import { globalSyncThrottle, type SyncThrottleController } from "@/server/sync/throttle";

const INSIGHT_LEVELS: MetaEntityLevel[] = ["account", "campaign", "adset", "ad"];
const DEFAULT_BREAKDOWNS = [["age"], ["gender"], ["country"], ["publisher_platform"]];

export type SyncWorkerDependencies = {
  provider?: MetaAdsProvider;
  getDb?: () => Database | null;
  enqueueChunk?: (data: SyncAccountChunkJobData) => Promise<unknown>;
  throttle?: SyncThrottleController;
};

export type JobLike = Pick<Job<SyncQueueJobData>, "name" | "data" | "updateProgress"> & { id?: string; attemptsMade?: number };

function resolveDb(deps: SyncWorkerDependencies): Database | null {
  if (deps.getDb) {
    try {
      return deps.getDb();
    } catch {
      return null;
    }
  }
  try {
    return getDatabase();
  } catch {
    return null;
  }
}

function jobLogContext(job: JobLike, extra: Record<string, string | number | boolean | null | undefined> = {}) {
  return {
    queue: SYNC_QUEUE_NAME,
    jobName: job.name,
    jobId: job.id ?? null,
    traceId: (job.data as { traceId?: string }).traceId ?? null,
    ...extra
  };
}

export function createMetaAdsProviderForJobs(env: Record<string, string | undefined> = process.env): MetaAdsProvider {
  const config = getAppConfig(env);

  if (config.META_PROVIDER === "mock") {
    return createMockMetaAdsProvider();
  }

  if (!config.META_SYSTEM_USER_ACCESS_TOKEN) {
    throw new Error("META_SYSTEM_USER_ACCESS_TOKEN is required when META_PROVIDER=graph-api");
  }

  return createGraphApiMetaAdsProvider({
    accessToken: config.META_SYSTEM_USER_ACCESS_TOKEN,
    appSecret: config.META_APP_SECRET,
    graphApiVersion: config.META_GRAPH_API_VERSION
  });
}

async function fetchAllPages<T>(fetchPage: (paging?: MetaPaging) => Promise<MetaPage<T>>): Promise<T[]> {
  const { rows, truncated } = await fetchAllPagesBounded(fetchPage, { maxPages: 50, pageSize: 100 });
  if (truncated) {
    logger.warn("Meta sync pagination truncated at safety bound", { maxPages: 50 });
  }
  return rows;
}

function countUnavailableStates(rows: MetaInsightRow[] | MetaBreakdownRow[]) {
  return rows.reduce((total, row) => {
    return total + Object.values(row.availability).filter((state) => state && state !== "available" && state !== "actual_zero").length;
  }, 0);
}

/** Map a persisted syncAccount outcome onto the legacy job-result shape. */
function toJobResult(traceId: string, accountId: string, result: import("@/server/sync/meta-sync").SyncAccountResult): SyncJobResult {
  const mapped = emptyResult(traceId, accountId);
  mapped.status = result.status;
  for (const stage of result.stages) {
    if (stage.stage === "fetch_campaigns") mapped.stats.campaignsScanned += stage.scanned;
    else if (stage.stage === "fetch_adsets") mapped.stats.adSetsScanned += stage.scanned;
    else if (stage.stage === "fetch_ads") mapped.stats.adsScanned += stage.scanned;
    else if (stage.stage.startsWith("fetch_insights_")) mapped.stats.insightsScanned += stage.scanned;
    else if (stage.stage.startsWith("fetch_breakdown_")) mapped.stats.breakdownRowsScanned += stage.scanned;
    else if (stage.stage === "fetch_account") mapped.stats.accountsScanned += stage.scanned;
    for (const stageError of stage.errors) {
      mapped.warnings.push(`${stage.stage}: ${stageError.safeMessage}`);
    }
  }
  mapped.stats.unavailableMetricStates += result.availability.length;
  return mapped;
}

function emptyResult(traceId: string, accountId?: string): SyncJobResult {  return {
    status: "success",
    traceId,
    accountId,
    stats: {
      accountsScanned: 0,
      campaignsScanned: 0,
      adSetsScanned: 0,
      adsScanned: 0,
      creativesScanned: 0,
      insightsScanned: 0,
      breakdownRowsScanned: 0,
      unavailableMetricStates: 0
    },
    warnings: []
  };
}

function readCheckpoint(run: { checkpoint?: unknown } | null): ChunkCheckpoint | null {
  const checkpoint = (run as { checkpoint?: unknown } | null)?.checkpoint as ChunkCheckpoint | undefined;
  if (!checkpoint || checkpoint.version !== 1 || !Array.isArray(checkpoint.chunks)) return null;
  return checkpoint;
}

function errorKindOf(error: unknown): MetaApiError["kind"] | "unknown" {
  return error instanceof MetaApiError ? error.kind : "unknown";
}

function retryAfterOf(error: unknown): number | undefined {
  if (error instanceof MetaApiError) {
    const value = (error.safeDetails as { retryAfterMs?: unknown }).retryAfterMs;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

async function scanAccount(provider: MetaAdsProvider, accountId: string, dateRange: MetaDateRange, traceId: string, includeBreakdowns = false): Promise<SyncJobResult> {
  const result = emptyResult(traceId, accountId);

  const accounts = await fetchAllPages((paging) => provider.listAdAccounts(paging));
  const account = accounts.find((item) => item.id === accountId || item.accountId === accountId);
  if (!account) {
    result.status = "partial";
    result.warnings.push(`Account ${accountId} was not returned by the provider`);
    return result;
  }
  result.stats.accountsScanned = 1;

  const campaigns = await fetchAllPages((paging) => provider.listCampaigns(account.id, paging));
  const adSets = await fetchAllPages((paging) => provider.listAdSets(account.id, undefined, paging));
  const ads = await fetchAllPages((paging) => provider.listAds(account.id, undefined, paging));

  result.stats.campaignsScanned += campaigns.length;
  result.stats.adSetsScanned += adSets.length;
  result.stats.adsScanned += ads.length;

  for (const ad of ads) {
    const creative = await provider.getCreative(ad.id);
    if (creative) result.stats.creativesScanned += 1;
  }

  for (const level of INSIGHT_LEVELS) {
    const rows = await fetchAllPages((paging) =>
      provider.getInsights({ accountId: account.id, level, dateRange, timeIncrement: 1, limit: paging?.limit, after: paging?.after })
    );
    result.stats.insightsScanned += rows.length;
    result.stats.unavailableMetricStates += countUnavailableStates(rows);
  }

  if (includeBreakdowns) {
    for (const breakdowns of DEFAULT_BREAKDOWNS) {
      const rows = await fetchAllPages((paging) =>
        provider.getBreakdowns({ accountId: account.id, level: "campaign", dateRange, breakdowns, limit: paging?.limit, after: paging?.after })
      );
      result.stats.breakdownRowsScanned += rows.length;
      result.stats.unavailableMetricStates += countUnavailableStates(rows);
    }
  }

  if (result.stats.unavailableMetricStates > 0) {
    result.status = "partial";
    result.warnings.push("Provider returned unavailable, unsupported, partial, or null metric states; these are preserved for analytics consumers");
  }

  return result;
}

async function processSyncAllAccounts(provider: MetaAdsProvider, data: SyncAllAccountsJobData): Promise<SyncJobResult> {
  const accounts = await fetchAllPages((paging) => provider.listAdAccounts(paging));
  const summary = emptyResult(data.traceId);

  for (const account of accounts) {
    const accountResult = await scanAccount(provider, account.id, data.dateRange, data.traceId, data.includeBreakdowns);
    summary.stats.accountsScanned += accountResult.stats.accountsScanned;
    summary.stats.campaignsScanned += accountResult.stats.campaignsScanned;
    summary.stats.adSetsScanned += accountResult.stats.adSetsScanned;
    summary.stats.adsScanned += accountResult.stats.adsScanned;
    summary.stats.creativesScanned += accountResult.stats.creativesScanned;
    summary.stats.insightsScanned += accountResult.stats.insightsScanned;
    summary.stats.breakdownRowsScanned += accountResult.stats.breakdownRowsScanned;
    summary.stats.unavailableMetricStates += accountResult.stats.unavailableMetricStates;
    summary.warnings.push(...accountResult.warnings.map((warning) => `${account.name}: ${warning}`));
  }

  if (summary.warnings.length > 0) summary.status = "partial";
  return summary;
}

function resolveJobDateRange(data: SyncAdAccountJobData | SyncAllAccountsJobData): MetaDateRange {
  if (data.rollingDatePreset) {
    return resolveDatePreset(data.rollingDatePreset, data.timezone ?? "UTC");
  }
  return data.dateRange;
}

function scopeFor(
  db: Database,
  agencyId: string,
  clientId: string,
  env: Record<string, string | undefined> = process.env
) {
  const config = getAppConfig(env);
  return {
    agencyId,
    clientId,
    providerMode: (config.META_PROVIDER === "graph-api" ? "graph_api" : "mock") as "mock" | "graph_api",
    apiVersion: config.META_GRAPH_API_VERSION
  };
}

async function processPersistedAccountRange(
  db: Database,
  provider: MetaAdsProvider,
  data: { agencyId: string; accountId: string; traceId: string; includeBreakdowns?: boolean; requestedByUserId?: string },
  dateRange: MetaDateRange,
  syncType: "scheduled" | "manual" | "backfill" | "incremental",
  env: Record<string, string | undefined> = process.env
) {
  const { clientId } = await ensureDefaultScope(db, data.agencyId);
  return runPersistedSync(db, provider, data.accountId, dateRange, scopeFor(db, data.agencyId, clientId, env), {
    includeBreakdowns: data.includeBreakdowns ?? true,
    syncType
  });
}

async function processPlannerJob(job: JobLike, raw: SyncBackfillPlannerJobData, dependencies: SyncWorkerDependencies) {
  const parsed = backfillPlannerPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new UnrecoverableError("Invalid backfill planner payload");
  const data = parsed.data;
  assertPayloadHasNoSecrets(data);
  const db = resolveDb(dependencies);
  if (!db) throw new UnrecoverableError("Backfill planner requires DATABASE_URL; refusing to plan chunks without checkpoint persistence");

  const sync = new SyncRepository({ db, agencyId: data.agencyId });
  const run = await sync.findRun(data.parentRunId);
  if (!run) throw new UnrecoverableError(`Parent sync run ${data.parentRunId} no longer exists`);
  if (run.status === "cancelled") {
    logger.info("Backfill planner skipped for cancelled run", jobLogContext(job, { parentRunId: data.parentRunId }));
    return { parentRunId: data.parentRunId, planned: 0, skipped: true as const };
  }
  if (run.status === "success") {
    return { parentRunId: data.parentRunId, planned: 0, skipped: true as const };
  }

  let checkpoint = readCheckpoint(run);
  if (!checkpoint) {
    checkpoint = createCheckpoint(data.accountId, data.syncKind, data.dateStart, data.dateEnd, data.chunkDays, data.timezone ?? "UTC");
  }
  const pending = pendingChunks(checkpoint);
  const enqueueChunk = dependencies.enqueueChunk ?? ((payload: SyncAccountChunkJobData) => enqueueAccountChunkSync(payload));

  let planned = 0;
  for (const chunk of pending) {
    const payload: SyncAccountChunkJobData = {
      agencyId: data.agencyId,
      accountId: data.accountId,
      parentRunId: data.parentRunId,
      chunkIndex: chunk.index,
      totalChunks: checkpoint.chunks.length,
      dateRange: { since: chunk.since, until: chunk.until },
      syncKind: data.syncKind,
      syncType: data.syncType,
      includeBreakdowns: data.includeBreakdowns,
      requestedByUserId: data.requestedByUserId,
      traceId: data.traceId
    };
    assertPayloadHasNoSecrets(payload);
    await enqueueChunk(payload);
    planned += 1;
  }

  await sync.saveCheckpoint(data.parentRunId, { ...checkpoint, currentChunk: null, lastCheckpointAt: new Date().toISOString() });
  if (run.status === "queued") await sync.markRunning(data.parentRunId);
  await job.updateProgress({ status: "running", traceId: data.traceId, planned, ...checkpointSummary(checkpoint) }).catch(() => undefined);
  logger.info("Backfill planner enqueued date chunks", jobLogContext(job, { parentRunId: data.parentRunId, planned, totalChunks: checkpoint.chunks.length }));
  return { parentRunId: data.parentRunId, planned, skipped: false as const };
}

async function processChunkJob(job: JobLike, raw: SyncAccountChunkJobData, dependencies: SyncWorkerDependencies, env: Record<string, string | undefined> = process.env) {
  const parsed = chunkJobPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new UnrecoverableError("Invalid chunk job payload");
  const data = parsed.data;
  assertPayloadHasNoSecrets(data);

  const db = resolveDb(dependencies);
  const provider = dependencies.provider ?? createMetaAdsProviderForJobs(env);
  const throttle = dependencies.throttle ?? globalSyncThrottle;
  const syncKind: SyncKind = data.syncKind;

  await job.updateProgress({ status: "running", traceId: data.traceId, chunkIndex: data.chunkIndex }).catch(() => undefined);

  if (!db) {
    // No database: honest stats-only scan of the chunk range (mock/dev path, never persisted).
    logger.warn("Chunk job ran without DATABASE_URL; performing non-persisted scan", jobLogContext(job, { parentRunId: data.parentRunId, chunkIndex: data.chunkIndex }));
    const result = await scanAccount(provider, data.accountId, data.dateRange, data.traceId, data.includeBreakdowns);
    return { ...result, persisted: false as const, syncKind };
  }

  const sync = new SyncRepository({ db, agencyId: data.agencyId });
  const parent = await sync.findRun(data.parentRunId);
  if (parent && parent.status === "cancelled") {
    logger.info("Chunk job skipped for cancelled run", jobLogContext(job, { parentRunId: data.parentRunId, chunkIndex: data.chunkIndex }));
    return { status: "cancelled" as const, traceId: data.traceId, accountId: data.accountId, persisted: true as const, syncKind };
  }

  await throttle.pace(data.accountId);

  try {
    const { clientId } = await ensureDefaultScope(db, data.agencyId);
    const { result } = await runPersistedSync(db, provider, data.accountId, data.dateRange, scopeFor(db, data.agencyId, clientId, env), {
      includeBreakdowns: data.includeBreakdowns ?? true,
      syncType: data.syncType
    });
    throttle.recordOutcome(data.accountId, "healthy");
    await markParentChunkComplete(db, data, result.status);
    await job.updateProgress({ status: result.status, traceId: data.traceId, chunkIndex: data.chunkIndex }).catch(() => undefined);
    logger.info("Chunk sync persisted", jobLogContext(job, { parentRunId: data.parentRunId, chunkIndex: data.chunkIndex, status: result.status }));
    return { ...result, persisted: true as const, syncKind };
  } catch (error) {
    const kind = errorKindOf(error);
    const retryable = kind !== "unknown" && retryDecisionForKind(kind as MetaApiError["kind"]).retryable;
    throttle.recordOutcome(data.accountId, retryable || kind === "unknown" ? "pressure" : "healthy", retryAfterOf(error));
    await markParentChunkFailed(db, data, kind);
    await persistChunkError(db, data, error);
    logger.error("Chunk sync failed", jobLogContext(job, { parentRunId: data.parentRunId, chunkIndex: data.chunkIndex, kind }));

    if (!retryable && kind !== "unknown") {
      // Permanent Meta failure: do not burn BullMQ attempts.
      throw new UnrecoverableError(toSafeUserMessage(error));
    }
    const decision = kind === "unknown" ? { baseDelayMs: 30_000 } : retryDecisionForKind(kind as MetaApiError["kind"]);
    const delay = backoffDelayMs((job.attemptsMade ?? 0) + 1, decision.baseDelayMs, retryAfterOf(error));
    logger.warn("Chunk sync will retry with backoff", jobLogContext(job, { chunkIndex: data.chunkIndex, delayMs: delay }));
    throw error;
  }
}

async function markParentChunkComplete(db: Database, data: SyncAccountChunkJobData, status: string) {
  const sync = new SyncRepository({ db, agencyId: data.agencyId });
  const parent = await sync.findRun(data.parentRunId);
  if (!parent || parent.status === "cancelled") return;
  const checkpoint = readCheckpoint(parent);
  if (!checkpoint) return;
  const next = markChunkComplete(checkpoint, data.chunkIndex);
  const remaining = pendingChunks(next);
  const summary = checkpointSummary(next);
  if (remaining.length === 0) {
    const hasFailures = next.failedChunks.length > 0;
    const finalStatus = status === "failed" || hasFailures ? "partial" : status === "partial" ? "partial" : "success";
    await sync.finishRun(data.parentRunId, {
      status: finalStatus,
      stats: { ...((parent.stats as Record<string, unknown>) ?? {}), chunks: summary },
      checkpoint: next,
      errorSummary: hasFailures ? `${next.failedChunks.length} chunk(s) need resume; see sync_errors.` : null
    });
    await auditLogSafe({
      db,
      agencyId: data.agencyId,
      userId: null,
      action: "meta.sync.complete",
      resourceType: "sync_run",
      resourceId: data.parentRunId,
      metadata: { status: finalStatus, totalChunks: summary.totalChunks, completedChunks: summary.completedChunks }
    });
  } else {
    await sync.saveCheckpoint(data.parentRunId, { ...next, statsHint: summary });
  }
}

async function markParentChunkFailed(db: Database, data: SyncAccountChunkJobData, kind: string) {
  const sync = new SyncRepository({ db, agencyId: data.agencyId });
  const parent = await sync.findRun(data.parentRunId);
  if (!parent || parent.status === "cancelled") return;
  const checkpoint = readCheckpoint(parent);
  if (!checkpoint) return;
  await sync.saveCheckpoint(data.parentRunId, markChunkFailed(checkpoint, data.chunkIndex, kind));
}

async function persistChunkError(db: Database, data: SyncAccountChunkJobData, error: unknown) {
  try {
    const sync = new SyncRepository({ db, agencyId: data.agencyId });
    const kind = errorKindOf(error);
    const retryable = kind === "unknown" ? true : retryDecisionForKind(kind as MetaApiError["kind"]).retryable;
    await sync.recordError({
      syncRunId: data.parentRunId,
      adAccountId: null,
      severity: "error",
      providerCode: error instanceof MetaApiError ? error.code : undefined,
      safeMessage: `chunk ${data.chunkIndex} (${data.dateRange.since}–${data.dateRange.until}): ${toSafeUserMessage(error)}`.slice(0, 2000),
      retryable,
      requestContext: { stage: "chunk", chunkIndex: data.chunkIndex, kind }
    });
  } catch {
    // Error persistence must never mask the original failure.
  }
}

/** Union dispatcher used by the BullMQ worker. Legacy callers should use processSyncJob. */
export async function processJob(job: JobLike, dependencies: SyncWorkerDependencies = {}, env: Record<string, string | undefined> = process.env): Promise<unknown> {
  if (job.name === SYNC_BACKFILL_PLANNER_JOB) {
    return processPlannerJob(job, job.data as SyncBackfillPlannerJobData, dependencies);
  }
  if (job.name === SYNC_ACCOUNT_CHUNK_JOB) {
    return processChunkJob(job, job.data as SyncAccountChunkJobData, dependencies, env);
  }
  return processSyncJob(job, dependencies, env);
}

export async function processSyncJob(job: JobLike, dependencies: SyncWorkerDependencies = {}, env: Record<string, string | undefined> = process.env): Promise<SyncJobResult> {

  const provider = dependencies.provider ?? createMetaAdsProviderForJobs(env);
  const dateRange = resolveJobDateRange(job.data as SyncAdAccountJobData | SyncAllAccountsJobData);
  const db = resolveDb(dependencies);

  try {
    await job.updateProgress({ status: "running", traceId: (job.data as { traceId: string }).traceId, dateRange }).catch(() => undefined);
    logger.info("Started read-only Meta sync job", { queue: SYNC_QUEUE_NAME, jobName: job.name, traceId: (job.data as { traceId: string }).traceId });

    // Production path: persist through runPersistedSync when a database is available.
    if (db && job.name === SYNC_AD_ACCOUNT_JOB) {
      const data = job.data as SyncAdAccountJobData;
      const persisted = await processPersistedAccountRange(db, provider, data, dateRange, data.type === "scheduled" ? "incremental" : data.type, env);
      logger.info("Finished persisted Meta sync job", {
        queue: SYNC_QUEUE_NAME,
        jobName: job.name,
        status: persisted.result.status,
        runId: persisted.runId,
        traceId: data.traceId
      });
      return toJobResult(data.traceId, data.accountId, persisted.result);
    }

    const result =
      job.name === SYNC_AD_ACCOUNT_JOB
        ? await scanAccount(provider, (job.data as SyncAdAccountJobData).accountId, dateRange, (job.data as { traceId: string }).traceId, (job.data as SyncAdAccountJobData).includeBreakdowns)
        : await processSyncAllAccounts(provider, { ...(job.data as SyncAllAccountsJobData), dateRange });

    await job.updateProgress({ status: result.status, traceId: result.traceId, stats: result.stats }).catch(() => undefined);
    logger.info("Finished read-only Meta sync job", {
      queue: SYNC_QUEUE_NAME,
      jobName: job.name,
      status: result.status,
      traceId: result.traceId,
      accountsScanned: result.stats.accountsScanned,
      insightsScanned: result.stats.insightsScanned
    });
    return result;
  } catch (error) {
    if (error instanceof MetaApiError) {
      logger.error("Meta provider error during read-only sync job", {
        queue: SYNC_QUEUE_NAME,
        jobName: job.name,
        traceId: (job.data as { traceId: string }).traceId,
        kind: error.kind,
        code: error.code,
        retryable: error.retryable
      });
      if (!error.retryable) throw new UnrecoverableError(`Non-retryable Meta provider error: ${error.kind} (${error.code})`);
    }
    throw error;
  }
}

export function createSyncWorker(env: Record<string, string | undefined> = process.env, dependencies: SyncWorkerDependencies = {}) {
  return new Worker<SyncQueueJobData, SyncJobResult>(SYNC_QUEUE_NAME, (job) => processJob(job, dependencies, env) as Promise<SyncJobResult>, {
    connection: createRedisConnection(env),
    concurrency: getAppConfig(env).META_SYNC_CONCURRENCY
  });
}

export function defaultIncrementalDateRange(timezone = "UTC", referenceInstant = new Date()) {
  return resolveDatePreset("last_3_days", timezone, referenceInstant);
}
