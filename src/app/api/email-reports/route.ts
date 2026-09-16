import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import type { RepositoryContext } from "@/server/repositories/types";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import {
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

const createSchema = z.object({
  name: z.string().min(1).max(220),
  accountId: z.string().min(1).max(120),
  reportType: z.enum(["account_summary", "campaign_report", "adset_report", "ad_report", "ai_summary", "performance_alerts", "custom"]).default("account_summary"),
  schedule: scheduleSchema,
  timezone: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  recipients: z.array(z.object({ email: z.string().email(), name: z.string().max(180).optional() })).max(25).optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET() {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  try {
    const { agencyId } = await getRequestAgency(db);
    const context: RepositoryContext = { db, agencyId };
    const reports = new EmailReportRepository(context);
    const recipients = new EmailRecipientRepository(context);
    const accounts = new AdAccountRepository(context);
    const rows = await reports.list({ limit: 100 });
    const configs = [];
    for (const row of rows) {
      if (!row.adAccountId) continue;
      const account = await accounts.findById(row.adAccountId);
      if (!account) continue;
      const recipientRows = (await recipients.listByReport(row.id)) ?? [];
      configs.push(dbReportToConfig(row, account.metaAccountId, recipientRows));
    }
    return jsonResponse({ ok: true, reports: configs });
  } catch {
    return jsonResponse({ ok: false, error: "Email reports are unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid email report request" }, { status: 400 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const context: RepositoryContext = { db, agencyId };
    const accounts = new AdAccountRepository(context);
    const account =
      (await accounts.findByMetaAccountId(parsed.data.accountId)) ??
      (await accounts.findByMetaAccountId(parsed.data.accountId.replace(/^act_/, "")));
    if (!account) return jsonResponse({ ok: false, error: "Ad account not found" }, { status: 404 });

    const now = new Date();
    const reports = new EmailReportRepository(context);
    const created = await reports.create({
      clientId: account.clientId,
      adAccountId: account.id,
      entityLevel: "account",
      entityId: null,
      name: parsed.data.name,
      reportType: parsed.data.reportType,
      enabled: parsed.data.enabled ?? true,
      schedule: { ...parsed.data.schedule },
      timezone: parsed.data.timezone ?? parsed.data.schedule.timezone,
      nextRunAt: computeNextRun(parsed.data.schedule, now),
      lastRunAt: null,
      lastStatus: null
    });

    const recipients = new EmailRecipientRepository(context);
    for (const recipient of parsed.data.recipients ?? []) {
      await recipients.add(created.id, { email: recipient.email.toLowerCase(), name: recipient.name, status: "active" });
    }

    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.report.create",
      resourceType: "email_report",
      resourceId: created.id,
      metadata: { name: created.name, reportType: created.reportType }
    });
    return jsonResponse({ ok: true, reportId: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /Invalid schedule localTime|Unable to compute/.test(error.message)) {
      return jsonResponse({ ok: false, error: error.message }, { status: 400 });
    }
    return jsonResponse({ ok: false, error: "Email report creation failed" }, { status: 500 });
  }
}
