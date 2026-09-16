import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { EmailRecipientRepository } from "@/server/repositories/email-repository";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().max(180).nullable().optional(),
  status: z.enum(["active", "invited", "disabled"]).optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

type RouteContext = { params: Promise<{ id: string; recipientId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id, recipientId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return jsonResponse({ ok: false, error: "Invalid recipient update" }, { status: 400 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const recipients = new EmailRecipientRepository({ db, agencyId });
    const updated = await recipients.update(id, recipientId, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {})
    });
    if (!updated) return jsonResponse({ ok: false, error: "Recipient not found" }, { status: 404 });
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.recipient.update",
      resourceType: "email_report",
      resourceId: id,
      metadata: { recipientId, fields: Object.keys(parsed.data) }
    });
    return jsonResponse({ ok: true, recipientId });
  } catch {
    return jsonResponse({ ok: false, error: "Recipient update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id, recipientId } = await context.params;
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const recipients = new EmailRecipientRepository({ db, agencyId });
    const removed = await recipients.remove(id, recipientId);
    if (!removed) return jsonResponse({ ok: false, error: "Recipient not found" }, { status: 404 });
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.recipient.remove",
      resourceType: "email_report",
      resourceId: id,
      metadata: { recipientId }
    });
    return jsonResponse({ ok: true, recipientId });
  } catch {
    return jsonResponse({ ok: false, error: "Recipient removal failed" }, { status: 500 });
  }
}
