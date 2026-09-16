import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import type { RepositoryContext } from "@/server/repositories/types";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import {
  EmailDeliveryLogRepository,
  EmailRecipientRepository,
  EmailReportRepository
} from "@/server/repositories/email-repository";
import { dbReportToConfig } from "@/server/email/service";
import { computeNextRun } from "@/server/email/scheduler";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  cadence: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(80),
  datePreset: z.enum(["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"]),
  includeAiSummary: z.boolean().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).max(220).optional(),
  enabled: z.boolean().optional(),
  reportType: z.enum(["account_summary", "campaign_report", "adset_report", "ad_report", "ai_summary", "performance_alerts", "custom"]).optional(),
  schedule: scheduleSchema.optional(),
  timezone: z.string().min(1).max(80).optional()
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
    const repositoryContext: RepositoryContext = { db, agencyId };
    const reports = new EmailReportRepository(repositoryContext);
    const row = await reports.findById(id);
    if (!row || !row.adAccountId) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });
    const accounts = new AdAccountRepository(repositoryContext);
    const account = await accounts.findById(row.adAccountId);
    if (!account) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });
    const recipients = new EmailRecipientRepository(repositoryContext);
    const logs = new EmailDeliveryLogRepository(repositoryContext);
    const [recipientRows, logRows] = await Promise.all([
      recipients.listByReport(row.id),
      logs.listByReport(row.id, 20)
    ]);
    return jsonResponse({
      ok: true,
      report: dbReportToConfig(row, account.metaAccountId, recipientRows ?? []),
      deliveryLogs: (logRows ?? []).map((log) => ({
        id: log.id,
        status: log.status,
        provider: log.provider ?? "mock",
        recipientCount: log.recipientCount,
        attempt: log.attempt,
        safeError: log.safeError,
        renderedSubject: log.renderedSubject,
        sentAt: log.sentAt?.toISOString() ?? null,
        createdAt: log.createdAt.toISOString()
      }))
    });
  } catch {
    return jsonResponse({ ok: false, error: "Email report is unavailable" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return jsonResponse({ ok: false, error: "Invalid email report update" }, { status: 400 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const repositoryContext: RepositoryContext = { db, agencyId };
    const reports = new EmailReportRepository(repositoryContext);
    const existing = await reports.findById(id);
    if (!existing) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.reportType !== undefined) patch.reportType = parsed.data.reportType;
    if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
    if (parsed.data.schedule !== undefined) {
      const schedule = { ...parsed.data.schedule };
      patch.schedule = schedule;
      patch.timezone = parsed.data.timezone ?? schedule.timezone;
      // Reschedule from now so cadence/timezone edits take effect immediately.
      patch.nextRunAt = computeNextRun(parsed.data.schedule, new Date());
    }
    if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;

    const updated = await reports.update(id, patch as Parameters<EmailReportRepository["update"]>[1]);
    if (!updated) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });

    const wasEnabled = existing.enabled;
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: parsed.data.enabled === undefined || parsed.data.enabled === wasEnabled ? "email.report.update" : parsed.data.enabled ? "email.report.enable" : "email.report.disable",
      resourceType: "email_report",
      resourceId: id,
      metadata: { fields: Object.keys(patch) }
    });
    return jsonResponse({ ok: true, reportId: id });
  } catch (error) {
    if (error instanceof Error && /Invalid schedule localTime|Unable to compute/.test(error.message)) {
      return jsonResponse({ ok: false, error: error.message }, { status: 400 });
    }
    return jsonResponse({ ok: false, error: "Email report update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const repositoryContext: RepositoryContext = { db, agencyId };
    const reports = new EmailReportRepository(repositoryContext);
    const removed = await reports.remove(id);
    if (!removed) return jsonResponse({ ok: false, error: "Email report not found" }, { status: 404 });
    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.report.delete",
      resourceType: "email_report",
      resourceId: id,
      metadata: { name: removed.name }
    });
    return jsonResponse({ ok: true, reportId: id });
  } catch {
    return jsonResponse({ ok: false, error: "Email report deletion failed" }, { status: 500 });
  }
}
