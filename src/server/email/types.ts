import type { DateRangePreset } from "@/lib/dates/reporting";
import type { AnalyticsMetricSet } from "@/server/analytics";

export type EmailReportType = "account_summary" | "campaign_report" | "adset_report" | "ad_report" | "ai_summary" | "performance_alerts";
export type EmailCadence = "daily" | "weekly" | "monthly";
export type EmailDeliveryStatus = "queued" | "sent" | "failed" | "skipped";

export type EmailSchedule = {
  cadence: EmailCadence;
  dayOfWeek?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  dayOfMonth?: number;
  localTime: string;
  timezone: string;
  datePreset: DateRangePreset;
};

export type EmailRecipient = {
  email: string;
  name?: string;
  status: "active" | "invited" | "disabled";
};

export type EmailReportConfig = {
  id: string;
  agencyId: string;
  clientId?: string;
  accountId?: string;
  entityLevel?: "account" | "campaign" | "adset" | "ad";
  entityId?: string;
  name: string;
  reportType: EmailReportType;
  enabled: boolean;
  schedule: EmailSchedule;
  recipients: EmailRecipient[];
  includeAiSummary: boolean;
  dashboardPath: string;
  createdAt: string;
  updatedAt: string;
};

export type RenderedEmailReport = {
  reportId: string;
  subject: string;
  text: string;
  html: string;
  metrics: AnalyticsMetricSet;
  currency: string;
  caveats: string[];
  dashboardPath: string;
};

export type EmailSendInput = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type EmailSendResult = {
  status: "sent" | "skipped";
  provider: "mock" | "resend";
  providerMessageId?: string;
  safeMessage: string;
};

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

export type EmailDeliveryLog = {
  id: string;
  emailReportId: string;
  status: EmailDeliveryStatus;
  provider: "mock" | "resend";
  providerMessageId?: string;
  recipientCount: number;
  safeError?: string;
  renderedSubject: string;
  sentAt?: string;
  createdAt: string;
};

export type EmailReportsDashboardData = {
  provider: "mock" | "resend";
  providerConfigured: boolean;
  generatedAt: string;
  reports: EmailReportConfig[];
  deliveryLogs: EmailDeliveryLog[];
  previews: RenderedEmailReport[];
  caveats: string[];
};
