"use server";

import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import { EmailRecipientRepository, EmailReportRepository } from "@/server/repositories/email-repository";
import { computeNextRun } from "@/server/email/scheduler";
import { logger } from "@/server/observability/logger";

export type EmailConfigFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

const emailListSchema = z
  .string()
  .min(1, "Add at least one recipient")
  .transform((value) =>
    value
      .split(/[\n,]+/)
      .map((email) => email.trim())
      .filter(Boolean)
  )
  .pipe(z.array(z.string().email()).min(1).max(25));

const providerSchema = z.object({
  provider: z.enum(["mock", "resend"]),
  fromEmail: z.string().email("Use a verified sender email"),
  apiKeySet: z.enum(["configured", "missing"])
});

const routingSchema = z.object({
  reportId: z.string().min(1),
  accountId: z.string().min(1),
  recipients: emailListSchema,
  cadence: z.enum(["daily", "weekly", "monthly"]),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time")
});

export async function saveEmailProviderConfigAction(_prevState: EmailConfigFormState, formData: FormData): Promise<EmailConfigFormState> {
  const parsed = providerSchema.safeParse({
    provider: formData.get("provider"),
    fromEmail: formData.get("fromEmail"),
    apiKeySet: formData.get("apiKeySet")
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Provider settings need review." };
  }

  logger.info("Email provider configuration validated", {
    provider: parsed.data.provider,
    fromConfigured: true,
    apiKeySet: parsed.data.apiKeySet === "configured"
  });

  return {
    status: "success",
    message: parsed.data.provider === "resend" ? "Provider settings validated. Store the API key in environment secrets before live sending." : "Mock provider selected for safe preview sends."
  };
}

export async function saveEmailRoutingAction(_prevState: EmailConfigFormState, formData: FormData): Promise<EmailConfigFormState> {
  const parsed = routingSchema.safeParse({
    reportId: formData.get("reportId"),
    accountId: formData.get("accountId"),
    recipients: formData.get("recipients"),
    cadence: formData.get("cadence"),
    localTime: formData.get("localTime")
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Report routing needs review." };
  }

  // Persist routing against PostgreSQL when the report exists there;
  // otherwise preserve the legacy validation-only demo behavior.
  let db;
  try {
    db = getDatabase();
  } catch {
    logger.info("Email report routing validated", {
      reportId: parsed.data.reportId,
      accountId: parsed.data.accountId,
      recipientCount: parsed.data.recipients.length,
      cadence: parsed.data.cadence
    });
    return { status: "success", message: "Report routing validated for this account and recipient list." };
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const context = { db, agencyId };
    const reports = new EmailReportRepository(context);
    const existing = await reports.findById(parsed.data.reportId);
    if (!existing) {
      logger.info("Email report routing validated", {
        reportId: parsed.data.reportId,
        accountId: parsed.data.accountId,
        recipientCount: parsed.data.recipients.length,
        cadence: parsed.data.cadence
      });
      return { status: "success", message: "Report routing validated for this account and recipient list." };
    }

    const accounts = new AdAccountRepository(context);
    const account =
      (await accounts.findByMetaAccountId(parsed.data.accountId)) ??
      (await accounts.findByMetaAccountId(parsed.data.accountId.replace(/^act_/, "")));
    if (!account) {
      return { status: "error", message: "Selected ad account is not connected." };
    }

    const currentSchedule = (existing.schedule ?? {}) as Record<string, unknown>;
    const mergedSchedule = { ...currentSchedule, cadence: parsed.data.cadence, localTime: parsed.data.localTime };
    await reports.update(parsed.data.reportId, {
      adAccountId: account.id,
      clientId: account.clientId,
      schedule: mergedSchedule,
      nextRunAt: computeNextRun({
        cadence: parsed.data.cadence,
        localTime: parsed.data.localTime,
        timezone: typeof currentSchedule.timezone === "string" ? currentSchedule.timezone : existing.timezone,
        datePreset: typeof currentSchedule.datePreset === "string" ? (currentSchedule.datePreset as "last_7_days") : "last_7_days"
      }, new Date())
    });

    const recipients = new EmailRecipientRepository(context);
    const current = (await recipients.listByReport(parsed.data.reportId)) ?? [];
    for (const row of current) {
      await recipients.remove(parsed.data.reportId, row.id);
    }
    for (const email of parsed.data.recipients) {
      await recipients.add(parsed.data.reportId, { email: email.toLowerCase(), status: "active" });
    }

    await auditLogSafe({
      db,
      agencyId,
      userId,
      action: "email.report.update",
      resourceType: "email_report",
      resourceId: parsed.data.reportId,
      metadata: { fields: ["adAccountId", "schedule", "recipients"], recipientCount: parsed.data.recipients.length }
    });

    logger.info("Email report routing persisted", {
      reportId: parsed.data.reportId,
      accountId: parsed.data.accountId,
      recipientCount: parsed.data.recipients.length,
      cadence: parsed.data.cadence
    });
    return { status: "success", message: "Report routing saved to the database." };
  } catch (error) {
    if (error instanceof Error && /Invalid schedule localTime|Unable to compute/.test(error.message)) {
      return { status: "error", message: error.message };
    }
    logger.error("Email report routing persistence failed", {
      reportId: parsed.data.reportId,
      errorName: error instanceof Error ? error.name : "unknown"
    });
    return { status: "error", message: "Report routing could not be saved." };
  }
}
