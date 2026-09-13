import { NextResponse } from "next/server";

import { createConfiguredMetaAdsProvider, getMetaProviderReadiness } from "@/server/meta";
import { fetchAllPagesBounded } from "@/server/meta/pagination";
import { toSafeUserMessage } from "@/server/meta/errors";
import { applySecurityHeaders } from "@/server/security/headers";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET() {
  const readiness = getMetaProviderReadiness();

  try {
    const provider = createConfiguredMetaAdsProvider();
    const { rows, truncated } = await fetchAllPagesBounded((paging) => provider.listAdAccounts(paging), { maxPages: 10, pageSize: 100 });
    return jsonResponse({
      ok: true,
      provider: readiness.provider,
      graphApiVersion: readiness.graphApiVersion,
      count: rows.length,
      truncated,
      accounts: rows.map((account) => ({
        id: account.id,
        accountId: account.accountId,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone,
        accessStatus: account.accessStatus
      }))
    });
  } catch (error) {
    logger.error("Meta account discovery failed", { provider: readiness.provider });
    return jsonResponse({ ok: false, error: toSafeUserMessage(error) }, { status: 502 });
  }
}
