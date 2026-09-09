import type { AnalyticsMetricSet, MetricValue } from "@/server/analytics/metrics/types";
import { compareMetric, type MetricComparison } from "@/server/analytics/comparison/comparison";
import { unavailableMetric } from "@/server/analytics/metrics/value";

export type TrendPoint = {
  date: string;
  metrics: AnalyticsMetricSet;
};

export type MetricTrend = {
  metricKey: keyof AnalyticsMetricSet;
  points: Array<{ date: string; value: MetricValue }>;
  firstToLast: MetricComparison;
};

export function calculateTrend(points: TrendPoint[], metricKey: keyof AnalyticsMetricSet): MetricTrend {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const metricPoints = sorted.map((point) => ({ date: point.date, value: point.metrics[metricKey] }));
  const first = metricPoints[0]?.value ?? unavailableMetric("insufficient_data", "Trend requires at least two points");
  const last = metricPoints.at(-1)?.value ?? unavailableMetric("insufficient_data", "Trend requires at least two points");

  return {
    metricKey,
    points: metricPoints,
    firstToLast:
      metricPoints.length >= 2
        ? compareMetric(last, first)
        : compareMetric(unavailableMetric("insufficient_data", "Trend requires at least two points"), first)
  };
}
