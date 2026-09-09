import type { DateRangePreset } from "@/lib/dates/reporting";
import type { AnalyticsMetricSet, MetricValue } from "@/server/analytics";

export type AiIntent = "account_summary" | "top_performers" | "bottom_performers" | "anomalies" | "ad_analysis" | "data_availability";

export type AiToolName =
  | "get_account_summary"
  | "get_campaign_performance"
  | "get_ad_performance"
  | "get_trend"
  | "get_top_entities"
  | "get_bottom_entities"
  | "get_anomalies"
  | "get_data_availability";

export type AiQuestionInput = {
  question: string;
  accountId?: string;
  adId?: string;
  preset?: DateRangePreset;
};

export type AiEvidenceMetric = {
  label: string;
  metric: MetricValue;
  format: "number" | "currency" | "percent" | "ratio";
  currency?: string;
};

export type AiEvidenceBlock = {
  id: string;
  toolName: AiToolName;
  title: string;
  scope: string;
  dateRange: string;
  timezone: string;
  currency?: string;
  metrics: AiEvidenceMetric[];
  records?: Array<Record<string, string | number | null>>;
  caveats: string[];
};

export type GroundedAiContext = {
  intent: AiIntent;
  generatedAt: string;
  question: string;
  modelMode: "mock-grounded" | "openai";
  evidence: AiEvidenceBlock[];
};

export type GroundedAiAnswer = {
  answer: string;
  context: GroundedAiContext;
};

export type SerializableMetricSet = Pick<AnalyticsMetricSet, "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpa" | "conversions" | "conversionValue" | "roas">;
