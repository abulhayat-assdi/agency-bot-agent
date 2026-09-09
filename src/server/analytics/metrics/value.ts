import type { MetricSource, MetricState, MetricValue } from "@/server/analytics/metrics/types";

const unavailableStates = new Set<MetricState>([
  "null_from_source",
  "unavailable",
  "unsupported",
  "insufficient_data",
  "api_error",
  "partial"
]);

export function metricValue(value: number | null | undefined, state?: MetricState, source: MetricSource = "meta", reason?: string): MetricValue {
  if (value === undefined || value === null) {
    return { value: null, state: state ?? "null_from_source", source, reason };
  }

  if (!Number.isFinite(value)) {
    return { value: null, state: "unavailable", source, reason: reason ?? "Metric is not finite" };
  }

  return { value, state: state ?? (value === 0 ? "actual_zero" : "available"), source, reason };
}

export function derivedMetric(value: number | null, state: MetricState, reason?: string): MetricValue {
  return metricValue(value, state, "derived", reason);
}

export function isMetricUsable(metric: MetricValue | null | undefined): metric is MetricValue<number> & { value: number } {
  return Boolean(metric && typeof metric.value === "number" && Number.isFinite(metric.value) && !unavailableStates.has(metric.state));
}

export function unavailableMetric(state: MetricState, reason: string, source: MetricSource = "derived"): MetricValue {
  return { value: null, state, source, reason };
}
