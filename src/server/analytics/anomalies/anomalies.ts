import type { AnalyticsMetricSet, DerivedMetricKey, SourceMetricKey } from "@/server/analytics/metrics/types";
import { compareMetric, type MetricComparison } from "@/server/analytics/comparison/comparison";
import { isMetricUsable } from "@/server/analytics/metrics/value";
import { evaluateDataSufficiency, type SufficiencyResult } from "@/server/analytics/sufficiency/sufficiency";

export type AnomalyType = "cpa_spike" | "ctr_drop" | "cpm_spike" | "roas_decline" | "conversion_drop" | "spend_change";

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyThresholds = {
  cpaSpikePct: number;
  ctrDropPct: number;
  cpmSpikePct: number;
  roasDeclinePct: number;
  conversionDropPct: number;
  spendChangePct: number;
  spendChangeMinimumAbsolute: number;
};

export const defaultAnomalyThresholds: AnomalyThresholds = {
  cpaSpikePct: 35,
  ctrDropPct: 25,
  cpmSpikePct: 30,
  roasDeclinePct: 30,
  conversionDropPct: 30,
  spendChangePct: 40,
  spendChangeMinimumAbsolute: 100
};

export type DetectedAnomaly = {
  type: AnomalyType;
  metricKey: SourceMetricKey | DerivedMetricKey;
  severity: AnomalySeverity;
  comparison: MetricComparison;
  sufficiency: SufficiencyResult;
  explanation: string;
};

function pct(comparison: MetricComparison) {
  return comparison.percentageChange.value;
}

function canEvaluate(current: AnalyticsMetricSet, baseline: AnalyticsMetricSet, metricKey: keyof AnalyticsMetricSet) {
  return isMetricUsable(current[metricKey]) && isMetricUsable(baseline[metricKey]);
}

function severityFor(percent: number): AnomalySeverity {
  const absolute = Math.abs(percent);
  if (absolute >= 60) return "critical";
  if (absolute >= 30) return "warning";
  return "info";
}

export function detectAnomalies(
  current: AnalyticsMetricSet,
  baseline: AnalyticsMetricSet,
  thresholds: AnomalyThresholds = defaultAnomalyThresholds
): DetectedAnomaly[] {
  const sufficiency = evaluateDataSufficiency(current);
  const anomalies: DetectedAnomaly[] = [];

  const add = (type: AnomalyType, metricKey: SourceMetricKey | DerivedMetricKey, comparison: MetricComparison, explanation: string) => {
    const percent = pct(comparison);
    anomalies.push({
      type,
      metricKey,
      severity: percent === null ? "info" : severityFor(percent),
      comparison,
      sufficiency,
      explanation
    });
  };

  if (canEvaluate(current, baseline, "cpa")) {
    const comparison = compareMetric(current.cpa, baseline.cpa);
    if ((pct(comparison) ?? 0) >= thresholds.cpaSpikePct) add("cpa_spike", "cpa", comparison, "CPA increased beyond the configured threshold.");
  }

  if (canEvaluate(current, baseline, "ctr")) {
    const comparison = compareMetric(current.ctr, baseline.ctr);
    if ((pct(comparison) ?? 0) <= -thresholds.ctrDropPct) add("ctr_drop", "ctr", comparison, "CTR decreased beyond the configured threshold.");
  }

  if (canEvaluate(current, baseline, "cpm")) {
    const comparison = compareMetric(current.cpm, baseline.cpm);
    if ((pct(comparison) ?? 0) >= thresholds.cpmSpikePct) add("cpm_spike", "cpm", comparison, "CPM increased beyond the configured threshold.");
  }

  if (canEvaluate(current, baseline, "roas")) {
    const comparison = compareMetric(current.roas, baseline.roas);
    if ((pct(comparison) ?? 0) <= -thresholds.roasDeclinePct) add("roas_decline", "roas", comparison, "ROAS decreased beyond the configured threshold.");
  }

  if (canEvaluate(current, baseline, "conversions")) {
    const comparison = compareMetric(current.conversions, baseline.conversions);
    if ((pct(comparison) ?? 0) <= -thresholds.conversionDropPct && (baseline.conversions.value ?? 0) >= 10) {
      add("conversion_drop", "conversions", comparison, "Conversions decreased beyond the configured threshold.");
    }
  }

  if (canEvaluate(current, baseline, "spend")) {
    const comparison = compareMetric(current.spend, baseline.spend);
    const absolute = Math.abs(comparison.absoluteChange.value ?? 0);
    if (Math.abs(pct(comparison) ?? 0) >= thresholds.spendChangePct && absolute >= thresholds.spendChangeMinimumAbsolute) {
      add("spend_change", "spend", comparison, "Spend changed beyond the configured threshold and minimum absolute amount.");
    }
  }

  return anomalies;
}
