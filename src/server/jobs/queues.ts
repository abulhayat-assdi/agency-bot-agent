import { Queue, QueueEvents, type JobsOptions } from "bullmq";

import { getAppConfig } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { createRedisConnection, isRedisConfigured } from "@/server/jobs/redis";
import {
  SYNC_AD_ACCOUNT_JOB,
  SYNC_ALL_ACCOUNTS_JOB,
  SYNC_QUEUE_NAME,
  type QueueReadiness,
  type SyncAdAccountJobData,
  type SyncAllAccountsJobData,
  type SyncQueueJobData
} from "@/server/jobs/types";

const DEFAULT_ATTEMPTS = 5;
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

export function getSyncQueueReadiness(env: Record<string, string | undefined> = process.env): QueueReadiness {
  const config = getAppConfig(env);
  return {
    configured: isRedisConfigured(env),
    queueName: SYNC_QUEUE_NAME,
    redisUrlPresent: Boolean(config.REDIS_URL),
    workerConcurrency: DEFAULT_SYNC_WORKER_CONCURRENCY,
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
