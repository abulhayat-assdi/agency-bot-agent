import type { AnalyticsMetricSet, InsightMetricInput, SourceMetricKey } from "@/server/analytics/metrics/types";
import { sourceMetricKeys, toAnalyticsMetricSet } from "@/server/analytics/metrics/normalization";

function round(value: number, decimals = 6) {
  return Number(value.toFixed(decimals));
}

export function aggregateSourceMetrics(rows: InsightMetricInput[]): AnalyticsMetricSet {
  const aggregate: Partial<Record<SourceMetricKey, number | null>> = {};
  const availability: InsightMetricInput["availability"] = {};

  for (const key of sourceMetricKeys) {
    const values = rows.map((row) => row[key]);
    const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (numericValues.length === 0) {
      aggregate[key] = null;
      availability[key] = "unavailable";
      continue;
    }

    aggregate[key] = round(numericValues.reduce((total, value) => total + value, 0));
    availability[key] = numericValues.length === values.length ? (aggregate[key] === 0 ? "actual_zero" : "available") : "partial";
  }

  return toAnalyticsMetricSet({ ...aggregate, availability });
}
