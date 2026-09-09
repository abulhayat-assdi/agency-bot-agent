import { randomUUID } from "node:crypto";

import { resolveDatePreset } from "@/lib/dates/reporting";
import { getSyncQueueReadiness, scheduleRecurringAllAccountSync } from "@/server/jobs";
import { logger } from "@/server/observability/logger";

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
const dateRange = resolveDatePreset("last_3_days", timezone);

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
