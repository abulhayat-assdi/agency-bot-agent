import { randomUUID } from "node:crypto";

import { getAppConfig } from "@/server/config/env";
import { closeDatabaseConnection, getDatabase } from "@/server/db/client";
import { getSyncQueueReadiness } from "@/server/jobs";
import { enqueueBackfillPlanner } from "@/server/jobs/queues";
import { closeRedisConnection } from "@/server/jobs/redis";
import { logger } from "@/server/observability/logger";
import { createShutdownCoordinator } from "@/server/process/shutdown";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { filterRunnableSpecs, planIncrementalSyncs } from "@/server/sync/scheduler";
import { createParentRun } from "@/server/sync/run-service";

const readiness = getSyncQueueReadiness();
const config = getAppConfig();

if (!readiness.configured) {
  logger.error("Cannot start scheduler because REDIS_URL is not configured", {
    queue: readiness.queueName,
    redisUrlPresent: readiness.redisUrlPresent
  });
  process.exit(1);
}

if (!config.DATABASE_URL) {
  logger.error("Cannot start scheduler because DATABASE_URL is not configured", {
    queue: readiness.queueName
  });
  process.exit(1);
}

const shutdown = createShutdownCoordinator();
shutdown.install();

let timer: NodeJS.Timeout | null = null;
let ticking = false;
shutdown.register("scheduler-loop", async () => {
  if (timer) clearInterval(timer);
});
shutdown.register("database", () => closeDatabaseConnection());
shutdown.register("redis", () => closeRedisConnection());

async function tick() {
  if (ticking || shutdown.isShuttingDown()) return;
  ticking = true;
  try {
    const db = getDatabase();
    const agencies = await db.query.agencies.findMany({ limit: 50 });
    let enqueued = 0;
    let skipped = 0;
    for (const agency of agencies) {
      const sync = new SyncRepository({ db, agencyId: agency.id });
      const accounts = await db.query.adAccounts.findMany({ limit: 200 });
      const scoped = accounts.filter((account) => account.agencyId === agency.id);
      const specs = planIncrementalSyncs(
        scoped.map((account) => ({
          agencyId: agency.id,
          metaAccountId: `act_${account.metaAccountId}`,
          accountDbId: account.id,
          timezone: account.timezone
        })),
        {
          lookbackDays: config.META_INCREMENTAL_LOOKBACK_DAYS,
          chunkDays: config.BACKFILL_CHUNK_DAYS,
          traceId: randomUUID()
        }
      );
      const active = await sync.findActiveRuns(200);
      const activeScopes = active.map((run) => {
        const checkpoint = run.checkpoint as { metaAccountId?: unknown; syncKind?: unknown } | null;
        return {
          metaAccountId: typeof checkpoint?.metaAccountId === "string" ? checkpoint.metaAccountId : null,
          syncKind: typeof checkpoint?.syncKind === "string" ? checkpoint.syncKind : null,
          status: run.status
        };
      });
      const { runnable, skipped: skippedCount } = filterRunnableSpecs(specs, activeScopes);
      skipped += skippedCount;
      for (const spec of runnable) {
        const { run } = await createParentRun(db, agency.id, {
          adAccountId: spec.accountDbId,
          providerMode: config.META_PROVIDER === "graph-api" ? "graph_api" : "mock",
          type: "scheduled",
          metaAccountId: spec.accountId,
          syncKind: spec.syncKind,
          since: spec.dateStart,
          until: spec.dateEnd,
          chunkDays: spec.chunkDays,
          timezone: spec.timezone,
          includeBreakdowns: false
        });
        await enqueueBackfillPlanner({
          agencyId: spec.agencyId,
          accountId: spec.accountId,
          parentRunId: run.id,
          dateStart: spec.dateStart,
          dateEnd: spec.dateEnd,
          timezone: spec.timezone,
          syncKind: spec.syncKind,
          syncType: spec.syncType,
          chunkDays: spec.chunkDays,
          includeBreakdowns: false,
          traceId: spec.traceId
        });
        enqueued += 1;
      }
    }
    logger.info("Scheduler tick complete", { queue: readiness.queueName, enqueued, skipped });
  } catch (error) {
    // A failed tick must never kill the scheduler; the next interval retries.
    logger.error("Scheduler tick failed", {
      queue: readiness.queueName,
      errorName: error instanceof Error ? error.name : "unknown"
    });
  } finally {
    ticking = false;
  }
}

const intervalMs = config.SYNC_INTERVAL_MINUTES * 60_000;

logger.info("Sync scheduler started", {
  queue: readiness.queueName,
  intervalMinutes: config.SYNC_INTERVAL_MINUTES,
  lookbackDays: config.META_INCREMENTAL_LOOKBACK_DAYS,
  chunkDays: config.BACKFILL_CHUNK_DAYS
});

await tick();
timer = setInterval(() => void tick(), intervalMs);
