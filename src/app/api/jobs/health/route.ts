import { NextResponse } from "next/server";

import { getSyncQueueReadiness } from "@/server/jobs";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getSyncQueueReadiness();

  const response = NextResponse.json({
    ok: readiness.configured,
    service: "bullmq-sync-queue",
    queue: readiness.queueName,
    redisConfigured: readiness.redisUrlPresent,
    workerConcurrency: readiness.workerConcurrency,
    defaultAttempts: readiness.defaultAttempts,
    repeatableSyncIntervalMinutes: readiness.repeatableSyncIntervalMinutes,
    readOnlyMetaMode: true
  });
  applySecurityHeaders(response.headers);
  return response;
}
