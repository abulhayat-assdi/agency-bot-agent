import type { MetaInsightRow } from "@/server/meta/types";
import type { AnalyticsMetricSet, InsightMetricInput, SourceMetricKey, SourceMetricSet } from "@/server/analytics/metrics/types";
import { calculateDerivedMetrics } from "@/server/analytics/metrics/formulas";
import { metricValue } from "@/server/analytics/metrics/value";

export const sourceMetricKeys: SourceMetricKey[] = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "linkClicks",
  "outboundClicks",
  "conversions",
  "conversionValue"
];

export function toSourceMetricSet(input: InsightMetricInput): SourceMetricSet {
  return Object.fromEntries(
    sourceMetricKeys.map((key) => [key, metricValue(input[key], input.availability?.[key], "meta")])
  ) as SourceMetricSet;
}

export function toAnalyticsMetricSet(input: InsightMetricInput): AnalyticsMetricSet {
  const source = toSourceMetricSet(input);
  return { ...source, ...calculateDerivedMetrics(source) };
}

export function insightRowToAnalyticsMetricSet(row: MetaInsightRow): AnalyticsMetricSet {
  return toAnalyticsMetricSet({
    spend: row.spend,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    outboundClicks: row.outboundClicks,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
    availability: row.availability
  });
}
