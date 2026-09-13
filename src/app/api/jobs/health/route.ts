import { NextResponse } from "next/server";

import { getSyncQueueMetrics, getSyncQueueReadiness } from "@/server/jobs";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = getSyncQueueReadiness();
  const metrics = await getSyncQueueMetrics();

  const response = NextResponse.json({
    ok: readiness.configured,
    service: "bullmq-sync-queue",
    queue: readiness.queueName,
    redisConfigured: readiness.redisUrlPresent,
    workerConcurrency: readiness.workerConcurrency,
    defaultAttempts: readiness.defaultAttempts,
    repeatableSyncIntervalMinutes: readiness.repeatableSyncIntervalMinutes,
    readOnlyMetaMode: true,
    // Autoscaling inputs: live depth when Redis is reachable, null otherwise.
    metrics
  });
  applySecurityHeaders(response.headers);
  return response;
}
