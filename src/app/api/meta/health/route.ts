import { NextResponse } from "next/server";

import { createConfiguredMetaAdsProvider, getMetaProviderReadiness } from "@/server/meta";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET(request: Request) {
  const readiness = getMetaProviderReadiness();
  const url = new URL(request.url);
  const live = url.searchParams.get("live") === "true";

  if (!live) {
    return jsonResponse({
      ok: readiness.configured,
      service: "meta-provider",
      provider: readiness.provider,
      graphApiVersion: readiness.graphApiVersion,
      tokenConfigured: readiness.tokenConfigured,
      appSecretConfigured: readiness.appSecretConfigured,
      readOnlyPermission: readiness.readOnlyPermission,
      writePermissionsRequested: readiness.writePermissionsRequested
    });
  }

  try {
    const provider = createConfiguredMetaAdsProvider();
    const health = await provider.healthCheck();
    const ok = health.status === "connected";
    return jsonResponse({
      ok,
      service: "meta-provider",
      provider: readiness.provider,
      graphApiVersion: readiness.graphApiVersion,
      tokenConfigured: readiness.tokenConfigured,
      appSecretConfigured: readiness.appSecretConfigured,
      readOnlyPermission: readiness.readOnlyPermission,
      writePermissionsRequested: readiness.writePermissionsRequested,
      health
    });
  } catch (error) {
    logger.error("Meta live health check failed", { provider: readiness.provider });
    return jsonResponse({ ok: false, service: "meta-provider", error: toSafeUserMessage(error) }, { status: 502 });
  }
}
