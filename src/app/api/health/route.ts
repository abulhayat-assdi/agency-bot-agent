import { NextResponse } from "next/server";

import { getAppConfig, getRuntimeReadiness } from "@/server/config/env";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getAppConfig();
  const readiness = getRuntimeReadiness(config);
  const response = NextResponse.json({
    status: "ok",
    service: config.APP_NAME,
    environment: config.APP_ENV,
    graphApiVersion: config.META_GRAPH_API_VERSION,
    readiness
  });
  applySecurityHeaders(response.headers);
  return response;
}
