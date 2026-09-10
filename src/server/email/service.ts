import { z } from "zod";

import { formatDateRange } from "@/lib/dates/reporting";
import { formatMetric } from "@/components/dashboard/metric-format";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";
import { answerAiQuestion } from "@/server/ai";
import { createEmailProvider, getEmailProviderReadiness } from "@/server/email/provider";
import { logger } from "@/server/observability/logger";
import type { EmailDeliveryLog, EmailProvider, EmailReportConfig, EmailReportsDashboardData, RenderedEmailReport } from "@/server/email/types";

const reportConfigSchema = z.object({
  id: z.string().min(1),
  recipients: z.array(z.object({ email: z.string().email(), name: z.string().optional(), status: z.enum(["active", "invited", "disabled"]) })).min(1),
  schedule: z.object({
    localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(1),
    datePreset: z.enum(["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"])
  })
});

export const mockEmailReportConfigs: EmailReportConfig[] = [
  {
    id: "email_report_northstar_weekly",
    agencyId: "agency_demo",
    clientId: "northstar-commerce",
    accountId: "act_100000000000001",
    entityLevel: "account",
    name: "Northstar weekly performance digest",
    reportType: "account_summary",
    enabled: true,
    schedule: {
      cadence: "weekly",
      dayOfWeek: "monday",
      localTime: "09:00",
      timezone: "Asia/Dhaka",
      datePreset: "last_7_days"
    },
    recipients: [
      { email: "owner@example.com", name: "Client Owner", status: "active" },
      { email: "agency-strategy@example.com", name: "Agency Strategy", status: "active" }
    ],
    includeAiSummary: true,
    dashboardPath: "/dashboard?accountId=act_100000000000001&preset=last_7_days",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z"
  },
  {
    id: "email_report_studio_alerts",
    agencyId: "agency_demo",
    clientId: "studio-atlas",
    accountId: "act_200000000000002",
    entityLevel: "account",
    name: "Studio Atlas anomaly alerts",
    reportType: "performance_alerts",
    enabled: true,
    schedule: {
      cadence: "daily",
      localTime: "08:30",
      timezone: "America/New_York",
      datePreset: "last_3_days"
    },
    recipients: [{ email: "media-buyer@example.com", name: "Media Buyer", status: "active" }],
    includeAiSummary: false,
    dashboardPath: "/trends?accountId=act_200000000000002&preset=last_3_days",
    createdAt: "2026-09-02T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z"
  },
  {
    id: "email_report_paused_ad",
    agencyId: "agency_demo",
    clientId: "northstar-commerce",
    accountId: "act_100000000000001",
    entityLevel: "ad",
    entityId: "1000000000000011011129",
    name: "Paused ad watchlist",
    reportType: "ad_report",
    enabled: false,
    schedule: {
      cadence: "weekly",
      dayOfWeek: "thursday",
      localTime: "15:00",
      timezone: "Asia/Dhaka",
      datePreset: "last_7_days"
    },
    recipients: [{ email: "analyst@example.com", name: "Agency Analyst", status: "active" }],
    includeAiSummary: true,
    dashboardPath: "/ads/1000000000000011011129",
    createdAt: "2026-09-03T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z"
  }
];

const mockDeliveryLogs: EmailDeliveryLog[] = [
  {
    id: "email_log_001",
    emailReportId: "email_report_northstar_weekly",
    status: "sent",
    provider: "mock",
    providerMessageId: "mock_email_northstar_001",
    recipientCount: 2,
    renderedSubject: "Northstar weekly performance digest · 2026-09-04 – 2026-09-10",
    sentAt: "2026-09-09T03:00:00.000Z",
    createdAt: "2026-09-09T03:00:00.000Z"
  },
  {
    id: "email_log_002",
    emailReportId: "email_report_studio_alerts",
    status: "skipped",
    provider: "mock",
    recipientCount: 1,
    safeError: "No critical deterministic anomalies detected",
    renderedSubject: "Studio Atlas anomaly alerts · 2026-09-08 – 2026-09-10",
    createdAt: "2026-09-09T12:30:00.000Z"
  }
];

function activeRecipientEmails(report: EmailReportConfig) {
  return report.recipients.filter((recipient) => recipient.status === "active").map((recipient) => recipient.email);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function dashboardUrl(path: string) {
  return path;
}

function nextDeliveryDescription(report: EmailReportConfig) {
  const { cadence, dayOfWeek, dayOfMonth, localTime, timezone } = report.schedule;
  if (!report.enabled) return "Paused";
  if (cadence === "daily") return `Daily at ${localTime} (${timezone})`;
  if (cadence === "weekly") return `Every ${dayOfWeek ?? "week"} at ${localTime} (${timezone})`;
  return `Monthly on day ${dayOfMonth ?? 1} at ${localTime} (${timezone})`;
}

export async function renderEmailReport(report: EmailReportConfig, env: Record<string, string | undefined> = process.env): Promise<RenderedEmailReport> {
  reportConfigSchema.parse(report);
  const dashboard = await getDashboardData({ preset: report.schedule.datePreset, accountId: report.accountId });
  const accountSummary = dashboard.accountSummaries.find((summary) => summary.account.id === report.accountId) ?? dashboard.accountSummaries[0];

  if (!accountSummary) {
    throw new Error("No account summary available for email report rendering");
  }

  const metricRows = [
    ["Spend", formatMetric(accountSummary.metrics.spend, { kind: "currency", currency: accountSummary.account.currency }), accountSummary.metrics.spend.state],
    ["Impressions", formatMetric(accountSummary.metrics.impressions), accountSummary.metrics.impressions.state],
    ["Clicks", formatMetric(accountSummary.metrics.clicks), accountSummary.metrics.clicks.state],
    ["CTR", formatMetric(accountSummary.metrics.ctr, { kind: "percent" }), accountSummary.metrics.ctr.state],
    ["Conversions", formatMetric(accountSummary.metrics.conversions), accountSummary.metrics.conversions.state],
    ["CPA", formatMetric(accountSummary.metrics.cpa, { kind: "currency", currency: accountSummary.account.currency }), accountSummary.metrics.cpa.state],
    ["ROAS", formatMetric(accountSummary.metrics.roas, { kind: "ratio" }), accountSummary.metrics.roas.state]
  ];

  const aiSummary = report.includeAiSummary
    ? await answerAiQuestion(
        {
          question: report.reportType === "performance_alerts" ? "Explain anomalies and risks for this account." : "Summarize performance and highlight any risks.",
          accountId: accountSummary.account.id,
          preset: report.schedule.datePreset
        },
        env
      )
    : null;

  const anomalies = dashboard.currencySummaries.find((summary) => summary.currency === accountSummary.account.currency)?.anomalies ?? [];
  const subject = `${report.name} · ${dashboard.range.since} – ${dashboard.range.until}`;
  const caveats = [
    ...dashboard.caveats,
    "Email content is generated from deterministic application analytics; AI summaries, when enabled, use controlled read-only evidence only.",
    "No actual profit is reported in Phase 1; use conversion value and ROAS only."
  ];

  const text = [
    subject,
    `Scope: ${accountSummary.client.name} / ${accountSummary.account.name} / ${accountSummary.account.accountId}`,
    `Date range: ${formatDateRange(dashboard.range)}`,
    "",
    "Metrics:",
    ...metricRows.map(([label, value, state]) => `- ${label}: ${value} (${state})`),
    "",
    anomalies.length > 0 ? `Anomalies: ${anomalies.map((anomaly) => `${anomaly.type} (${anomaly.severity})`).join(", ")}` : "Anomalies: none detected by deterministic checks",
    aiSummary ? `\nGrounded AI summary:\n${aiSummary.answer}` : "",
    `\nOpen dashboard: ${dashboardUrl(report.dashboardPath)}`,
    "",
    "Caveats:",
    ...caveats.map((caveat) => `- ${caveat}`)
  ]
    .filter(Boolean)
    .join("\n");

  const htmlMetricRows = metricRows
    .map(([label, value, state]) => `<tr><td>${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td><td>${escapeHtml(state)}</td></tr>`)
    .join("");
  const html = `
    <main style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h1>${escapeHtml(report.name)}</h1>
      <p><strong>Scope:</strong> ${escapeHtml(accountSummary.client.name)} / ${escapeHtml(accountSummary.account.name)} / ${escapeHtml(accountSummary.account.accountId)}</p>
      <p><strong>Date range:</strong> ${escapeHtml(formatDateRange(dashboard.range))}</p>
      <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#cbd5e1"><thead><tr><th>Metric</th><th>Value</th><th>State</th></tr></thead><tbody>${htmlMetricRows}</tbody></table>
      <h2>Deterministic anomalies</h2>
      <p>${escapeHtml(anomalies.length > 0 ? anomalies.map((anomaly) => `${anomaly.type} (${anomaly.severity})`).join(", ") : "None detected")}</p>
      ${aiSummary ? `<h2>Grounded AI summary</h2><pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:12px">${escapeHtml(aiSummary.answer)}</pre>` : ""}
      <p><a href="${escapeHtml(dashboardUrl(report.dashboardPath))}">Open dashboard</a></p>
      <h2>Caveats</h2><ul>${caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
    </main>`;

  return {
    reportId: report.id,
    subject,
    text,
    html,
    metrics: accountSummary.metrics,
    currency: accountSummary.account.currency,
    caveats,
    dashboardPath: report.dashboardPath
  };
}

export async function sendEmailReport(reportId: string, dependencies: { provider?: EmailProvider; env?: Record<string, string | undefined> } = {}): Promise<EmailDeliveryLog> {
  const report = mockEmailReportConfigs.find((config) => config.id === reportId);
  if (!report) throw new Error("Email report configuration not found");

  const provider = dependencies.provider ?? createEmailProvider(dependencies.env);
  const rendered = await renderEmailReport(report, dependencies.env);
  const recipients = activeRecipientEmails(report);

  if (!report.enabled) {
    return {
      id: `email_log_${report.id}_skipped`,
      emailReportId: report.id,
      status: "skipped",
      provider: getEmailProviderReadiness(dependencies.env).provider,
      recipientCount: recipients.length,
      safeError: "Report is disabled",
      renderedSubject: rendered.subject,
      createdAt: new Date("2026-09-10T12:00:00.000Z").toISOString()
    };
  }

  try {
    const result = await provider.send({
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      metadata: { reportId: report.id, reportType: report.reportType }
    });
    return {
      id: `email_log_${report.id}_${result.providerMessageId ?? "sent"}`,
      emailReportId: report.id,
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      recipientCount: recipients.length,
      renderedSubject: rendered.subject,
      sentAt: new Date("2026-09-10T12:00:00.000Z").toISOString(),
      createdAt: new Date("2026-09-10T12:00:00.000Z").toISOString()
    };
  } catch (error) {
    const safeError = error instanceof Error ? error.message : "Unknown email provider failure";
    logger.warn("Email report delivery failed", { reportId: report.id, recipientCount: recipients.length, safeError });
    return {
      id: `email_log_${report.id}_failed`,
      emailReportId: report.id,
      status: "failed",
      provider: getEmailProviderReadiness(dependencies.env).provider,
      recipientCount: recipients.length,
      safeError,
      renderedSubject: rendered.subject,
      createdAt: new Date("2026-09-10T12:00:00.000Z").toISOString()
    };
  }
}

export async function getEmailReportsDashboardData(env: Record<string, string | undefined> = process.env): Promise<EmailReportsDashboardData> {
  const readiness = getEmailProviderReadiness(env);
  const previews = await Promise.all(mockEmailReportConfigs.map((report) => renderEmailReport(report, env)));

  return {
    provider: readiness.provider,
    providerConfigured: readiness.configured,
    generatedAt: new Date("2026-09-10T12:00:00.000Z").toISOString(),
    reports: mockEmailReportConfigs,
    deliveryLogs: mockDeliveryLogs,
    previews,
    caveats: [
      "Preview schedules use the validated configuration model until durable DB editing is enabled.",
      "Resend secrets must be set in environment variables, never committed.",
      "Unavailable metrics stay unavailable, never zero.",
      "Schedule times use the report/account timezone."
    ]
  };
}

export { nextDeliveryDescription };
