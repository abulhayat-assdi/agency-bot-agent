import { createSyncWorker, getSyncQueueReadiness } from "@/server/jobs";
import { closeDatabaseConnection } from "@/server/db/client";
import { closeRedisConnection } from "@/server/jobs/redis";
import { createShutdownCoordinator } from "@/server/process/shutdown";
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

const shutdown = createShutdownCoordinator();
shutdown.install();
shutdown.register("worker", () => worker.close());
shutdown.register("database", () => closeDatabaseConnection());
shutdown.register("redis", () => closeRedisConnection());
