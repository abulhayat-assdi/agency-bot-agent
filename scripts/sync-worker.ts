import { createSyncWorker, getSyncQueueReadiness } from "@/server/jobs";
import { logger } from "@/server/observability/logger";

const readiness = getSyncQueueReadiness();

if (!readiness.configured) {
  logger.error("Cannot start sync worker because REDIS_URL is not configured", {
    queue: readiness.queueName,
    redisUrlPresent: readiness.redisUrlPresent
  });
  process.exit(1);
}

const worker = createSyncWorker();

worker.on("completed", (job, result) => {
  logger.info("Sync worker completed job", {
    queue: readiness.queueName,
    jobId: job.id ?? null,
    jobName: job.name,
    status: result.status,
    traceId: result.traceId
  });
});

worker.on("failed", (job, error) => {
  logger.error("Sync worker failed job", {
    queue: readiness.queueName,
    jobId: job?.id ?? null,
    jobName: job?.name ?? null,
    errorName: error.name,
    errorMessage: error.message
  });
});

logger.info("Sync worker started", {
  queue: readiness.queueName,
  concurrency: readiness.workerConcurrency,
  attempts: readiness.defaultAttempts
});

const shutdown = async (signal: string) => {
  logger.info("Stopping sync worker", { signal, queue: readiness.queueName });
  await worker.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
