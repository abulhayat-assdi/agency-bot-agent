import { NextResponse } from "next/server";

import { getMetaProviderReadiness } from "@/server/meta";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getMetaProviderReadiness();
  const response = NextResponse.json({
    ok: readiness.configured,
    service: "meta-provider",
    provider: readiness.provider,
    graphApiVersion: readiness.graphApiVersion,
    tokenConfigured: readiness.tokenConfigured,
    appSecretConfigured: readiness.appSecretConfigured,
    readOnlyPermission: readiness.readOnlyPermission,
    writePermissionsRequested: readiness.writePermissionsRequested
  });
  applySecurityHeaders(response.headers);
  return response;
}
