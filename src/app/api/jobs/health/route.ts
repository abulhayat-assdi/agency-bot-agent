import { NextResponse } from "next/server";

import { getSyncQueueReadiness } from "@/server/jobs";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getSyncQueueReadiness();

  return NextResponse.json({
    ok: readiness.configured,
    service: "bullmq-sync-queue",
    queue: readiness.queueName,
    redisConfigured: readiness.redisUrlPresent,
    workerConcurrency: readiness.workerConcurrency,
    defaultAttempts: readiness.defaultAttempts,
    repeatableSyncIntervalMinutes: readiness.repeatableSyncIntervalMinutes,
    readOnlyMetaMode: true
  });
}
