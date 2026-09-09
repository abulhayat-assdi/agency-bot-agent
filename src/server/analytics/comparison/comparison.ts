import type { MetricState, MetricValue } from "@/server/analytics/metrics/types";
import { derivedMetric, isMetricUsable, unavailableMetric } from "@/server/analytics/metrics/value";

export type ChangeDirection = "up" | "down" | "flat" | "not_comparable";

export type MetricComparison = {
  current: MetricValue;
  comparison: MetricValue;
  absoluteChange: MetricValue;
  percentageChange: MetricValue;
  direction: ChangeDirection;
};

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function nonComparable(current: MetricValue, comparison: MetricValue, state: MetricState, reason: string): MetricComparison {
  return {
    current,
    comparison,
    absoluteChange: unavailableMetric(state, reason),
    percentageChange: unavailableMetric(state, reason),
    direction: "not_comparable"
  };
}

export function compareMetric(current: MetricValue, comparison: MetricValue): MetricComparison {
  if (!isMetricUsable(current)) {
    return nonComparable(current, comparison, current.state, `Current metric is ${current.state}`);
  }
  if (!isMetricUsable(comparison)) {
    return nonComparable(current, comparison, comparison.state, `Comparison metric is ${comparison.state}`);
  }

  const absolute = round(current.value - comparison.value);
  const absoluteChange = derivedMetric(absolute, absolute === 0 ? "actual_zero" : "available");

  if (comparison.value === 0) {
    return {
      current,
      comparison,
      absoluteChange,
      percentageChange: unavailableMetric("insufficient_data", "Percentage change unavailable because comparison value is zero"),
      direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat"
    };
  }

  const percentage = round((absolute / Math.abs(comparison.value)) * 100);
  return {
    current,
    comparison,
    absoluteChange,
    percentageChange: derivedMetric(percentage, percentage === 0 ? "actual_zero" : "available"),
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat"
  };
}
