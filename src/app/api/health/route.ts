import { NextResponse } from "next/server";

import { getAppConfig, getRuntimeReadiness } from "@/server/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getAppConfig();
  const readiness = getRuntimeReadiness(config);

  return NextResponse.json({
    status: "ok",
    service: config.APP_NAME,
    environment: config.APP_ENV,
    graphApiVersion: config.META_GRAPH_API_VERSION,
    readiness
  });
}
