import { createEmailProvider, getEmailProviderReadiness } from "@/server/email/provider";
import { dbReportToConfig, renderEmailReport } from "@/server/email/service";
import type { EmailProvider, EmailSchedule } from "@/server/email/types";
import type { Database } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { AdAccountRepository } from "@/server/repositories/ad-account-repository";
import {
  EmailDeliveryLogRepository,
  EmailRecipientRepository,
  EmailReportRepository
} from "@/server/repositories/email-repository";
import type { RepositoryContext } from "@/server/repositories/types";

export type EmailProcessProvider = {
  send: EmailProvider["send"];
  name: "mock" | "resend";
};

export type DueEmailProcessOptions = {
  env?: Record<string, string | undefined>;
  provider?: EmailProcessProvider;
  now?: Date;
  limit?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const DAY_MS = 86_400_000;
const CLAIM_LEASE_MS = 30 * 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

function zonedParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday").toLowerCase(), hour: Number(get("hour")), minute: Number(get("minute")) };
}

function parseLocalTime(localTime: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) throw new Error(`Invalid schedule localTime: ${localTime}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * Next scheduled occurrence at or after `from`, resolved in the report's own
 * timezone. DST transitions are handled by the Intl wall-clock resolution:
 * days are stepped in 24h increments from a wall-clock-anchored candidate, so
 * a 23/25-hour DST day shifts the instant but never skips or duplicates a run.
 */
export function computeNextRun(schedule: EmailSchedule, from: Date = new Date()): Date {
  const { hour, minute } = parseLocalTime(schedule.localTime);
  const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

  for (let offset = 0; offset <= 366; offset += 1) {
    const candidateDay = new Date(startDay.getTime() + offset * DAY_MS);
    const ymd = candidateDay.toISOString().slice(0, 10);
    // Anchor the candidate to the wall-clock time, then convert: interpret the
    // wall time in the target zone by finding the UTC instant whose zoned wall
    // clock matches. Approximation via iterative refinement (2 passes suffice).
    let guess = new Date(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
    for (let pass = 0; pass < 2; pass += 1) {
      const parts = zonedParts(guess, schedule.timezone);
      const driftMs = (parts.hour - hour) * 3_600_000 + (parts.minute - minute) * 60_000;
      guess = new Date(guess.getTime() - driftMs);
    }
    if (guess.getTime() < from.getTime()) continue;
    const dayParts = zonedParts(guess, schedule.timezone);
    if (schedule.cadence === "daily") return guess;
    if (schedule.cadence === "weekly") {
      const want = (schedule.dayOfWeek ?? "monday").toLowerCase();
      if (dayParts.weekday.startsWith(want.slice(0, 3))) return guess;
      continue;
    }
    const dayOfMonth = Number(ymd.slice(8, 10));
    if (dayOfMonth === Math.min(schedule.dayOfMonth ?? 1, 28)) return guess;
  }

  throw new Error("Unable to compute next email run within a year");
}

export function isRetryableEmailError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/status\s+4\d\d\b/.test(message) && !/status\s+429\b/.test(message)) return false;
  if (/recipient|domain|validation|invalid email|not found/i.test(message)) return false;
  return /timeout|network|fetch|econn|etimedout|socket|abort|429|5\d\d|temporar|unavailable|rate/i.test(message);
}

export type DueEmailProcessSummary = {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
};

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function detectProviderName(env?: Record<string, string | undefined>): "mock" | "resend" {
  try {
    return getEmailProviderReadiness(env).provider;
  } catch {
    return "mock";
  }
}

export async function processDueEmailReports(
  db: Database,
  agencyId: string,
  options: DueEmailProcessOptions = {}
): Promise<DueEmailProcessSummary> {
  const context: RepositoryContext = { db, agencyId };
  const reports = new EmailReportRepository(context);
  const recipients = new EmailRecipientRepository(context);
  const logs = new EmailDeliveryLogRepository(context);
  const accounts = new AdAccountRepository(context);
  const now = options.now ?? new Date();
  const maxAttempts = options.maxAttempts ?? 3;
  const summary: DueEmailProcessSummary = { due: 0, sent: 0, failed: 0, skipped: 0 };

  const due = await reports.findDue(now, options.limit ?? 10);
  summary.due = due.length;

  for (const report of due) {
    try {
      const claimed = await reports.claimDueReport(report.id, now, new Date(now.getTime() + CLAIM_LEASE_MS));
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }

      const schedule = report.schedule as unknown as EmailSchedule & { includeAiSummary?: boolean };
      const account = report.adAccountId ? await accounts.findById(report.adAccountId) : null;
      if (!account) {
        await logs.record({
          emailReportId: report.id,
          status: "failed",
          provider: null,
          recipientCount: 0,
          attempt: 1,
          safeError: "Linked ad account no longer exists",
          renderedSubject: report.name
        });
        await reports.recordRun(report.id, {
          lastRunAt: new Date(),
          lastStatus: "failed",
          nextRunAt: computeNextRun({ ...schedule, timezone: schedule.timezone || report.timezone }, now)
        });
        summary.failed += 1;
        continue;
      }

      const recipientRows = (await recipients.listByReport(report.id)) ?? [];
      const activeEmails = recipientRows.filter((row) => row.status === "active").map((row) => row.email);
      if (activeEmails.length === 0) {
        await logs.record({
          emailReportId: report.id,
          status: "skipped",
          provider: null,
          recipientCount: 0,
          attempt: 1,
          safeError: "No active recipients",
          renderedSubject: report.name
        });
        await reports.recordRun(report.id, {
          lastRunAt: new Date(),
          lastStatus: "skipped",
          nextRunAt: computeNextRun({ ...schedule, timezone: schedule.timezone || report.timezone }, now)
        });
        summary.skipped += 1;
        continue;
      }

      const config = dbReportToConfig(report, account.metaAccountId, recipientRows);
      const rendered = await renderEmailReport(config, options.env);
      const duplicate = await findRecentSentDuplicate(logs, report.id, rendered.subject, now);
      if (duplicate) {
        await reports.recordRun(report.id, {
          lastRunAt: new Date(),
          lastStatus: "skipped",
          nextRunAt: computeNextRun({ ...schedule, timezone: schedule.timezone || report.timezone }, now)
        });
        summary.skipped += 1;
        continue;
      }

      const sender: EmailProcessProvider = options.provider ?? {
        send: (input: Parameters<EmailProvider["send"]>[0]) => createEmailProvider(options.env).send(input),
        name: detectProviderName(options.env)
      };
      const providerName = sender.name;
      let attempt = 0;
      let delivered = false;
      while (attempt < maxAttempts && !delivered) {
        attempt += 1;
        try {
          const result = await sender.send({
            to: activeEmails,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            metadata: { reportId: report.id, reportType: config.reportType }
          });
          await logs.record({
            emailReportId: report.id,
            status: result.status === "sent" ? "sent" : "skipped",
            provider: providerName,
            providerMessageId: result.providerMessageId,
            recipientCount: activeEmails.length,
            attempt,
            renderedSubject: rendered.subject,
            sentAt: result.status === "sent" ? new Date() : null
          });
          delivered = true;
          await reports.recordRun(report.id, {
            lastRunAt: new Date(),
            lastStatus: result.status,
            nextRunAt: computeNextRun({ ...schedule, timezone: schedule.timezone || report.timezone }, now)
          });
          if (result.status === "sent") summary.sent += 1;
          else summary.skipped += 1;
        } catch (error) {
          await logs.record({
            emailReportId: report.id,
            status: "failed",
            provider: providerName,
            recipientCount: activeEmails.length,
            attempt,
            safeError: error instanceof Error ? error.message.slice(0, 500) : "Unknown email provider failure",
            renderedSubject: rendered.subject
          });
          if (!isRetryableEmailError(error) || attempt >= maxAttempts) break;
          await sleep((options.retryDelayMs ?? 500) * attempt);
        }
      }
      if (!delivered) {
        await reports.recordRun(report.id, {
          lastRunAt: new Date(),
          lastStatus: "failed",
          nextRunAt: computeNextRun({ ...schedule, timezone: schedule.timezone || report.timezone }, now)
        });
        summary.failed += 1;
        logger.warn("Email report delivery exhausted retries", { reportId: report.id, attempts: attempt });
      }
    } catch (error) {
      // One bad report must never poison the whole tick.
      logger.error("Email scheduler failed for report", {
        reportId: report.id,
        errorName: error instanceof Error ? error.name : "unknown"
      });
      summary.failed += 1;
    }
  }

  return summary;
}

async function findRecentSentDuplicate(
  logs: EmailDeliveryLogRepository,
  reportId: string,
  subject: string,
  now: Date
) {
  const recent = (await logs.listByReport(reportId, 5)) ?? [];
  return recent.some(
    (log) =>
      log.status === "sent" &&
      log.renderedSubject === subject &&
      now.getTime() - new Date(log.createdAt).getTime() < DUPLICATE_WINDOW_MS
  );
}
