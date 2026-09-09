import { formatDateRange } from "@/lib/dates/reporting";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";
import { getAdReport } from "@/server/reports/mock-report-data";
import { getTrendDashboardData } from "@/server/trends";
import type { AiEvidenceBlock, AiEvidenceMetric, AiQuestionInput } from "@/server/ai/types";
import type { AnalyticsMetricSet } from "@/server/analytics";

function coreMetrics(metrics: AnalyticsMetricSet, currency?: string): AiEvidenceMetric[] {
  return [
    { label: "Spend", metric: metrics.spend, format: "currency", currency },
    { label: "Impressions", metric: metrics.impressions, format: "number" },
    { label: "Clicks", metric: metrics.clicks, format: "number" },
    { label: "CTR", metric: metrics.ctr, format: "percent" },
    { label: "CPC", metric: metrics.cpc, format: "currency", currency },
    { label: "Conversions", metric: metrics.conversions, format: "number" },
    { label: "CPA", metric: metrics.cpa, format: "currency", currency },
    { label: "ROAS", metric: metrics.roas, format: "ratio" }
  ];
}

export async function getAccountSummaryEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const dashboard = await getDashboardData({ preset: input.preset ?? "last_7_days", accountId: input.accountId });
  const summary = input.accountId
    ? dashboard.accountSummaries.find((item) => item.account.id === input.accountId) ?? dashboard.accountSummaries[0]
    : dashboard.accountSummaries[0];

  if (!summary) {
    return {
      id: "account-summary-unavailable",
      toolName: "get_account_summary",
      title: "Account summary unavailable",
      scope: "No account returned by provider",
      dateRange: formatDateRange(dashboard.range),
      timezone: dashboard.range.timezone,
      metrics: [],
      caveats: ["No account-specific data was available, so the AI must not invent account metrics."]
    };
  }

  return {
    id: `account-summary-${summary.account.id}`,
    toolName: "get_account_summary",
    title: `${summary.account.name} account summary`,
    scope: `${summary.client.name} / ${summary.account.accountId}`,
    dateRange: formatDateRange(dashboard.range),
    timezone: summary.account.timezone,
    currency: summary.account.currency,
    metrics: coreMetrics(summary.metrics, summary.account.currency),
    records: [
      {
        lastSyncAt: summary.lastSyncAt,
        freshnessState: summary.freshnessState,
        accessStatus: summary.account.accessStatus
      }
    ],
    caveats: dashboard.caveats
  };
}

export async function getTrendEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const trends = await getTrendDashboardData({ accountId: input.accountId, preset: input.preset ?? "last_7_days", entityLevel: "campaign", metricKey: "roas" });

  return {
    id: `trend-${trends.selectedAccount.id}`,
    toolName: "get_trend",
    title: `${trends.selectedAccount.name} trend`,
    scope: trends.selectedAccount.accountId,
    dateRange: formatDateRange(trends.range),
    timezone: trends.selectedAccount.timezone,
    currency: trends.selectedAccount.currency,
    metrics: coreMetrics(trends.accountMetrics, trends.selectedAccount.currency),
    records: trends.dailyTrend.map((point) => ({
      date: point.date,
      spend: point.spend,
      clicks: point.clicks,
      conversions: point.conversions,
      roas: point.roas
    })),
    caveats: trends.caveats
  };
}

export async function getTopEntitiesEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const trends = await getTrendDashboardData({ accountId: input.accountId, preset: input.preset ?? "last_7_days", entityLevel: "campaign", metricKey: "roas" });

  return {
    id: `top-campaigns-${trends.selectedAccount.id}`,
    toolName: "get_top_entities",
    title: "Top campaigns by ROAS",
    scope: trends.selectedAccount.accountId,
    dateRange: formatDateRange(trends.range),
    timezone: trends.selectedAccount.timezone,
    currency: trends.selectedAccount.currency,
    metrics: [],
    records: trends.topEntities.map((entity) => ({
      rank: entity.rank,
      name: entity.name,
      status: entity.status,
      spend: entity.metrics.spend.value,
      conversions: entity.metrics.conversions.value,
      roas: entity.metrics.roas.value,
      sufficiency: entity.sufficiency.state
    })),
    caveats: trends.caveats
  };
}

export async function getBottomEntitiesEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const trends = await getTrendDashboardData({ accountId: input.accountId, preset: input.preset ?? "last_7_days", entityLevel: "campaign", metricKey: "roas" });

  return {
    id: `bottom-campaigns-${trends.selectedAccount.id}`,
    toolName: "get_bottom_entities",
    title: "Bottom campaigns by ROAS",
    scope: trends.selectedAccount.accountId,
    dateRange: formatDateRange(trends.range),
    timezone: trends.selectedAccount.timezone,
    currency: trends.selectedAccount.currency,
    metrics: [],
    records: trends.bottomEntities.map((entity) => ({
      rank: entity.rank,
      name: entity.name,
      status: entity.status,
      spend: entity.metrics.spend.value,
      conversions: entity.metrics.conversions.value,
      roas: entity.metrics.roas.value,
      sufficiency: entity.sufficiency.state
    })),
    caveats: trends.caveats
  };
}

export async function getAnomalyEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const trends = await getTrendDashboardData({ accountId: input.accountId, preset: input.preset ?? "last_7_days", entityLevel: "campaign", metricKey: "roas" });

  return {
    id: `anomalies-${trends.selectedAccount.id}`,
    toolName: "get_anomalies",
    title: "Deterministic anomaly checks",
    scope: trends.selectedAccount.accountId,
    dateRange: formatDateRange(trends.range),
    timezone: trends.selectedAccount.timezone,
    currency: trends.selectedAccount.currency,
    metrics: coreMetrics(trends.accountMetrics, trends.selectedAccount.currency),
    records: trends.accountAnomalies.map((anomaly) => ({
      type: anomaly.type,
      severity: anomaly.severity,
      explanation: anomaly.explanation
    })),
    caveats: [
      ...trends.caveats,
      "Anomalies are threshold-based deterministic checks, not model-generated statistics."
    ]
  };
}

export async function getAdAnalysisEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  if (!input.adId) {
    return {
      id: "ad-analysis-missing-ad",
      toolName: "get_ad_performance",
      title: "Ad analysis unavailable",
      scope: "No ad selected",
      dateRange: "Unavailable",
      timezone: "Unavailable",
      metrics: [],
      caveats: ["No ad ID was provided, so account-specific ad performance cannot be analyzed."]
    };
  }

  const report = await getAdReport(input.adId, input.preset ?? "last_7_days");
  if (!report) {
    return {
      id: `ad-analysis-${input.adId}-missing`,
      toolName: "get_ad_performance",
      title: "Ad analysis unavailable",
      scope: input.adId,
      dateRange: "Unavailable",
      timezone: "Unavailable",
      metrics: [],
      caveats: ["The selected ad was not returned by the provider. The AI must not invent ad metrics."]
    };
  }

  return {
    id: `ad-analysis-${input.adId}`,
    toolName: "get_ad_performance",
    title: `${report.context.ad?.name ?? input.adId} selected-ad analysis`,
    scope: `${report.context.client.name} / ${report.context.account.accountId} / ${report.context.campaign?.name ?? "campaign unavailable"} / ${report.context.adSet?.name ?? "ad set unavailable"}`,
    dateRange: formatDateRange(report.range),
    timezone: report.context.account.timezone,
    currency: report.context.account.currency,
    metrics: coreMetrics(report.metrics, report.context.account.currency),
    records: [
      {
        campaign: report.context.campaign?.name ?? null,
        adSet: report.context.adSet?.name ?? null,
        creativeId: report.context.ad?.creativeId ?? null,
        creativeType: report.context.creative?.objectType ?? null,
        sufficiency: report.sufficiency.state,
        anomalyCount: report.anomalies.length
      },
      ...report.anomalies.map((anomaly) => ({ type: anomaly.type, severity: anomaly.severity, explanation: anomaly.explanation }))
    ],
    caveats: report.caveats
  };
}

export async function getDataAvailabilityEvidence(input: AiQuestionInput): Promise<AiEvidenceBlock> {
  const summary = await getAccountSummaryEvidence(input);
  return {
    ...summary,
    id: `${summary.id}-availability`,
    toolName: "get_data_availability",
    title: "Data availability states",
    records: summary.metrics.map((metric) => ({
      metric: metric.label,
      state: metric.metric.state,
      source: metric.metric.source,
      valueAvailable: metric.metric.value === null ? "no" : "yes"
    }))
  };
}
