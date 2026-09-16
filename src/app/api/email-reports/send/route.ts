import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { sendEmailReport, sendPersistedEmailReport } from "@/server/email";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { emailSendRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  reportId: z.string().min(1).max(160)
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function POST(request: Request) {
  const rateLimit = await emailSendRateLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ error: "Email report send rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid email report send request" }, { status: 400 });
  }

  let db = null;
  try {
    db = getDatabase();
  } catch {
    db = null;
  }

  // PostgreSQL-backed reports when a database is configured. Errors here
  // return directly: falling back to fixtures after a real send attempt could
  // double-deliver.
  if (db) {
    try {
      const { agencyId, userId } = await getRequestAgency(db);
      const { log } = await sendPersistedEmailReport(parsed.data.reportId, { db, agencyId });
      await auditLogSafe({
        db,
        agencyId,
        userId,
        action: "email.report.send",
        resourceType: "email_report",
        resourceId: parsed.data.reportId,
        metadata: { status: log.status, recipientCount: log.recipientCount }
      });
      return jsonResponse({ deliveryLog: log });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email report error";
      if (message.includes("not found")) {
        return jsonResponse({ error: "Email report not found" }, { status: 404 });
      }
      return jsonResponse({ error: "Email report send failed" }, { status: 500 });
    }
  }

  // No database: legacy fixture path for development and tests.
  try {
    const deliveryLog = await sendEmailReport(parsed.data.reportId);
    return jsonResponse({ deliveryLog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email report error";
    const status = message.includes("not found") ? 404 : 500;
    return jsonResponse({ error: status === 404 ? "Email report not found" : "Email report send failed" }, { status });
  }
}
