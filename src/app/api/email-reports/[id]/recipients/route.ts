import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import type { RepositoryContext } from "@/server/repositories/types";
import { EmailRecipientRepository } from "@/server/repositories/email-repository";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(180).optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    const { agencyId } = await getRequestAgency(db);
    const context: RepositoryContext = { db, agencyId };
    const recipients = new EmailRecipientRepository(context);
    const rows = await recipients.listByReport(id);
    if (!rows) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });
    return jsonResponse({ ok: true, recipients: rows });
  } catch {
    return jsonResponse({ ok: false, error: "Recipients are unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id } = await context.params;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid recipient" }, { status: 400 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const recipients = new EmailRecipientRepository({ db, agencyId });
    const created = await recipients.add(id, {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      status: "active"
    });
    if (!created) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.recipient.add",
      resourceType: "email_report",
      resourceId: id,
      metadata: { recipientId: created.id, email: created.email }
    });
    return jsonResponse({ ok: true, recipientId: created.id }, { status: 201 });
  } catch {
    return jsonResponse({ ok: false, error: "Recipient could not be added" }, { status: 500 });
  }
}
