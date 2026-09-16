import { randomUUID } from "node:crypto";

import { getAppConfig } from "@/server/config/env";
import { getSyncQueueReadiness, scheduleRecurringAllAccountSync } from "@/server/jobs";
import { logger } from "@/server/observability/logger";
import { incrementalSyncRange } from "@/server/sync/chunks";

const readiness = getSyncQueueReadiness();

if (!readiness.configured) {
  logger.error("Cannot schedule recurring sync because REDIS_URL is not configured", {
    queue: readiness.queueName,
    redisUrlPresent: readiness.redisUrlPresent
  });
  process.exit(1);
}

const agencyId = process.env.SYNC_AGENCY_ID ?? "mock-agency";
const timezone = process.env.SYNC_TIMEZONE ?? "UTC";
// Incremental schedule re-reads today plus a lookback window: Meta data stays mutable for a few days.
const dateRange = incrementalSyncRange(timezone, getAppConfig().META_INCREMENTAL_LOOKBACK_DAYS);

// No top-level await: the production image runs scripts as CJS through tsx.
async function main() {
  await scheduleRecurringAllAccountSync({
    agencyId,
    dateRange,
    rollingDatePreset: "last_3_days",
    timezone,
    includeBreakdowns: false,
    traceId: randomUUID()
  });

  logger.info("Recurring sync schedule registered", {
    queue: readiness.queueName,
    agencyId,
    intervalMinutes: readiness.repeatableSyncIntervalMinutes,
    timezone
  });
}

void main();
