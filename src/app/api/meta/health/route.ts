import { NextResponse } from "next/server";

import { getMetaProviderReadiness } from "@/server/meta";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getMetaProviderReadiness();
  return NextResponse.json({
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
