import { NextResponse } from "next/server";

import { getAppConfig, getRuntimeReadiness } from "@/server/config/env";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

async function checkDatabase(databaseUrl: string | undefined): Promise<{ configured: boolean; reachable: boolean }> {
  if (!databaseUrl) return { configured: false, reachable: false };
  try {
    const { getDatabase } = await import("@/server/db/client");
    // Lightweight reachability probe against the shared pool.
    const db = getDatabase();
    await db.query.agencies.findMany({ limit: 1 });
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}

async function checkRedis(redisUrl: string | undefined): Promise<{ configured: boolean; reachable: boolean; queue: string }> {
  if (!redisUrl) return { configured: false, reachable: false, queue: "meta-sync" };
  try {
    const { createRedisConnection } = await import("@/server/jobs/redis");
    const connection = createRedisConnection();
    await connection.ping();
    await connection.quit();
    return { configured: true, reachable: true, queue: "meta-sync" };
  } catch {
    return { configured: true, reachable: false, queue: "meta-sync" };
  }
}

/**
 * Deep readiness for deploys and container orchestration. Reports booleans
 * only — never secrets, connection strings, or tokens.
 */
export async function GET() {
  const config = getAppConfig();
  const base = getRuntimeReadiness(config);
  const [database, redis] = await Promise.all([checkDatabase(config.DATABASE_URL), checkRedis(config.REDIS_URL)]);

  const ready = base.app && database.reachable;
  return jsonResponse(
    {
      ready,
      service: config.APP_NAME,
      environment: config.APP_ENV,
      graphApiVersion: config.META_GRAPH_API_VERSION,
      application: { configured: base.app },
      auth: { configured: base.authConfigured },
      database,
      redis,
      meta: {
        provider: config.META_PROVIDER,
        configured: base.metaConfigured,
        tokenConfigured: Boolean(config.META_SYSTEM_USER_ACCESS_TOKEN)
      },
      ai: { configured: base.aiConfigured },
      email: { configured: base.emailConfigured }
    },
    { status: ready ? 200 : 503 }
  );
}
