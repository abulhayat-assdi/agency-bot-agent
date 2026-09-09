import { Worker, type Job } from "bullmq";

import { resolveDatePreset } from "@/lib/dates/reporting";
import { getAppConfig } from "@/server/config/env";
import { MetaApiError } from "@/server/meta/errors";
import { createMockMetaAdsProvider } from "@/server/meta";
import type { MetaAdsProvider, MetaBreakdownRow, MetaDateRange, MetaEntityLevel, MetaInsightRow, MetaPage, MetaPaging } from "@/server/meta/types";
import { logger } from "@/server/observability/logger";
import { createRedisConnection } from "@/server/jobs/redis";
import { DEFAULT_SYNC_WORKER_CONCURRENCY } from "@/server/jobs/queues";
import {
  SYNC_AD_ACCOUNT_JOB,
  SYNC_QUEUE_NAME,
  type SyncAdAccountJobData,
  type SyncAllAccountsJobData,
  type SyncJobResult,
  type SyncQueueJobData
} from "@/server/jobs/types";

const INSIGHT_LEVELS: MetaEntityLevel[] = ["account", "campaign", "adset", "ad"];
const DEFAULT_BREAKDOWNS = [["age"], ["gender"], ["country"], ["publisher_platform"]];

export type SyncWorkerDependencies = {
  provider?: MetaAdsProvider;
};

export function createMetaAdsProviderForJobs(env: Record<string, string | undefined> = process.env): MetaAdsProvider {
  const config = getAppConfig(env);

  if (config.META_PROVIDER === "mock") {
    return createMockMetaAdsProvider();
  }

  throw new Error("Graph API provider is not enabled yet; live read-only Meta sync is scheduled for the live Meta integration milestone");
}

async function fetchAllPages<T>(fetchPage: (paging?: MetaPaging) => Promise<MetaPage<T>>): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;

  do {
    const page = await fetchPage({ limit: 100, after });
    rows.push(...page.data);
    after = page.paging.cursors.after;
  } while (after);

  return rows;
}

function countUnavailableStates(rows: MetaInsightRow[] | MetaBreakdownRow[]) {
  return rows.reduce((total, row) => {
    return total + Object.values(row.availability).filter((state) => state && state !== "available" && state !== "actual_zero").length;
  }, 0);
}

function emptyResult(traceId: string, accountId?: string): SyncJobResult {
  return {
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

function resolveJobDateRange(data: SyncQueueJobData): MetaDateRange {
  if (data.rollingDatePreset) {
    return resolveDatePreset(data.rollingDatePreset, data.timezone ?? "UTC");
  }
  return data.dateRange;
}

export async function processSyncJob(job: Pick<Job<SyncQueueJobData>, "name" | "data" | "updateProgress">, dependencies: SyncWorkerDependencies = {}) {
  const provider = dependencies.provider ?? createMetaAdsProviderForJobs();
  const dateRange = resolveJobDateRange(job.data);

  try {
    await job.updateProgress({ status: "running", traceId: job.data.traceId, dateRange });
    logger.info("Started read-only Meta sync job", { queue: SYNC_QUEUE_NAME, jobName: job.name, traceId: job.data.traceId });

    const result =
      job.name === SYNC_AD_ACCOUNT_JOB
        ? await scanAccount(provider, (job.data as SyncAdAccountJobData).accountId, dateRange, job.data.traceId, job.data.includeBreakdowns)
        : await processSyncAllAccounts(provider, { ...(job.data as SyncAllAccountsJobData), dateRange });

    await job.updateProgress({ status: result.status, traceId: result.traceId, stats: result.stats });
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
        traceId: job.data.traceId,
        kind: error.kind,
        code: error.code,
        retryable: error.retryable
      });
      if (!error.retryable) throw new Error(`Non-retryable Meta provider error: ${error.kind} (${error.code})`);
    }
    throw error;
  }
}

export function createSyncWorker(env: Record<string, string | undefined> = process.env, dependencies: SyncWorkerDependencies = {}) {
  return new Worker<SyncQueueJobData, SyncJobResult>(SYNC_QUEUE_NAME, (job) => processSyncJob(job, dependencies), {
    connection: createRedisConnection(env),
    concurrency: DEFAULT_SYNC_WORKER_CONCURRENCY
  });
}

export function defaultIncrementalDateRange(timezone = "UTC", referenceInstant = new Date()) {
  return resolveDatePreset("last_3_days", timezone, referenceInstant);
}
