import { Queue, QueueEvents, type JobsOptions } from "bullmq";

import { getAppConfig } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { createRedisConnection, isRedisConfigured } from "@/server/jobs/redis";
import { assertPayloadHasNoSecrets, backfillPlannerJobId, chunkJobId } from "@/server/sync/chunks";
import {
  SYNC_ACCOUNT_CHUNK_JOB,
  SYNC_AD_ACCOUNT_JOB,
  SYNC_ALL_ACCOUNTS_JOB,
  SYNC_BACKFILL_PLANNER_JOB,
  SYNC_QUEUE_NAME,
  type QueueReadiness,
  type SyncAccountChunkJobData,
  type SyncAdAccountJobData,
  type SyncAllAccountsJobData,
  type SyncBackfillPlannerJobData,
  type SyncQueueJobData
} from "@/server/jobs/types";

const DEFAULT_ATTEMPTS = 5;
const CHUNK_JOB_ATTEMPTS = 8;
const CHUNK_JOB_BACKOFF_MS = 60_000;

function workerConcurrency(env: Record<string, string | undefined> = process.env) {
  return getAppConfig(env).META_SYNC_CONCURRENCY;
}

export const DEFAULT_SYNC_WORKER_CONCURRENCY = 2;

const defaultJobOptions: JobsOptions = {
  attempts: DEFAULT_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: 30_000
  },
  removeOnComplete: {
    age: 60 * 60 * 24 * 14,
    count: 1_000
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 30,
    count: 2_000
  }
};

export function createSyncQueue(env: Record<string, string | undefined> = process.env) {
  return new Queue<SyncQueueJobData>(SYNC_QUEUE_NAME, {
    connection: createRedisConnection(env),
    defaultJobOptions
  });
}

export function createSyncQueueEvents(env: Record<string, string | undefined> = process.env) {
  return new QueueEvents(SYNC_QUEUE_NAME, {
    connection: createRedisConnection(env)
  });
}

export type SyncQueueMetrics = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

/**
 * Live queue depth for autoscaling readiness and ops dashboards.
 * Returns null when Redis is not configured (local/test environments).
 */
export async function getSyncQueueMetrics(
  env: Record<string, string | undefined> = process.env,
  openQueue: (env: Record<string, string | undefined>) => Pick<Queue<SyncQueueJobData>, "getJobCounts" | "close"> = createSyncQueue
): Promise<SyncQueueMetrics | null> {
  if (!isRedisConfigured(env)) return null;
  const queue = openQueue(env);
  try {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0
    };
  } catch {
    return null;
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export function getSyncQueueReadiness(env: Record<string, string | undefined> = process.env): QueueReadiness {  const config = getAppConfig(env);
  return {
    configured: isRedisConfigured(env),
    queueName: SYNC_QUEUE_NAME,
    redisUrlPresent: Boolean(config.REDIS_URL),
    workerConcurrency: workerConcurrency(env),
    defaultAttempts: DEFAULT_ATTEMPTS,
    repeatableSyncIntervalMinutes: config.SYNC_INTERVAL_MINUTES
  };
}

export async function enqueueAdAccountSync(data: SyncAdAccountJobData, env: Record<string, string | undefined> = process.env) {
  const queue = createSyncQueue(env);
  const jobId = `${data.accountId}:${data.dateRange.since}:${data.dateRange.until}:${data.type}`;

  try {
    const job = await queue.add(SYNC_AD_ACCOUNT_JOB, data, { jobId });
    logger.info("Queued Meta ad account sync job", {
      queue: SYNC_QUEUE_NAME,
      jobId: job.id ?? null,
      accountId: data.accountId,
      type: data.type,
      traceId: data.traceId
    });
    return job;
  } finally {
    await queue.close();
  }
}

export async function enqueueAllAccountsSync(data: SyncAllAccountsJobData, env: Record<string, string | undefined> = process.env) {
  const queue = createSyncQueue(env);
  const jobId = `all:${data.agencyId}:${data.dateRange.since}:${data.dateRange.until}:${data.type}`;

  try {
    const job = await queue.add(SYNC_ALL_ACCOUNTS_JOB, data, { jobId });
    logger.info("Queued Meta all-account sync job", {
      queue: SYNC_QUEUE_NAME,
      jobId: job.id ?? null,
      agencyId: data.agencyId,
      type: data.type,
      traceId: data.traceId
    });
    return job;
  } finally {
    await queue.close();
  }
}

export async function enqueueAccountChunkSync(
  data: SyncAccountChunkJobData,
  env: Record<string, string | undefined> = process.env
) {
  assertPayloadHasNoSecrets(data);
  const queue = createSyncQueue(env);
  // Deterministic ID: re-enqueueing the same account+chunk dedupes instead of duplicating work.
  const jobId = chunkJobId(data.accountId, data.syncKind, data.dateRange.since, data.dateRange.until);

  try {
    const job = await queue.add(SYNC_ACCOUNT_CHUNK_JOB, data, {
      jobId,
      attempts: CHUNK_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: CHUNK_JOB_BACKOFF_MS }
    });
    logger.info("Queued Meta account chunk sync job", {
      queue: SYNC_QUEUE_NAME,
      jobId: job.id ?? null,
      accountId: data.accountId,
      chunkIndex: data.chunkIndex,
      totalChunks: data.totalChunks,
      parentRunId: data.parentRunId,
      traceId: data.traceId
    });
    return job;
  } finally {
    await queue.close();
  }
}

export async function enqueueBackfillPlanner(
  data: SyncBackfillPlannerJobData,
  env: Record<string, string | undefined> = process.env
) {
  assertPayloadHasNoSecrets(data);
  const queue = createSyncQueue(env);
  const jobId = backfillPlannerJobId(data.parentRunId);

  try {
    const job = await queue.add(SYNC_BACKFILL_PLANNER_JOB, data, { jobId, attempts: 3, backoff: { type: "exponential", delay: 10_000 } });
    logger.info("Queued Meta backfill planner job", {
      queue: SYNC_QUEUE_NAME,
      jobId: job.id ?? null,
      accountId: data.accountId,
      parentRunId: data.parentRunId,
      traceId: data.traceId
    });
    return job;
  } finally {
    await queue.close();
  }
}

export async function scheduleRecurringAllAccountSync(data: Omit<SyncAllAccountsJobData, "type">, env: Record<string, string | undefined> = process.env) {
  const config = getAppConfig(env);
  const queue = createSyncQueue(env);
  const every = config.SYNC_INTERVAL_MINUTES * 60 * 1_000;

  try {
    const job = await queue.upsertJobScheduler(`scheduled:${data.agencyId}`, { every }, {
      name: SYNC_ALL_ACCOUNTS_JOB,
      data: { ...data, type: "scheduled" },
      opts: defaultJobOptions
    });
    logger.info("Scheduled recurring Meta sync job", {
      queue: SYNC_QUEUE_NAME,
      jobId: job.id ?? null,
      agencyId: data.agencyId,
      intervalMinutes: config.SYNC_INTERVAL_MINUTES,
      traceId: data.traceId
    });
    return job;
  } finally {
    await queue.close();
  }
}
