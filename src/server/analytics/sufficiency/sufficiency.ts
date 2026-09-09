import type { AnalyticsMetricSet } from "@/server/analytics/metrics/types";

export type SufficiencyState = "insufficient_data" | "low_volume" | "directional_only" | "reliable_enough_for_comparison";

export type SufficiencyThresholds = {
  insufficientImpressionsBelow: number;
  insufficientClicksBelow: number;
  lowVolumeImpressionsBelow: number;
  lowVolumeClicksBelow: number;
  directionalImpressionsBelow: number;
  directionalClicksBelow: number;
  reliableConversionsAtLeast: number;
};

export const defaultSufficiencyThresholds: SufficiencyThresholds = {
  insufficientImpressionsBelow: 500,
  insufficientClicksBelow: 20,
  lowVolumeImpressionsBelow: 2000,
  lowVolumeClicksBelow: 50,
  directionalImpressionsBelow: 5000,
  directionalClicksBelow: 100,
  reliableConversionsAtLeast: 10
};

export type SufficiencyResult = {
  state: SufficiencyState;
  reasons: string[];
  thresholds: SufficiencyThresholds;
};

function value(metrics: AnalyticsMetricSet, key: "impressions" | "clicks" | "conversions") {
  return metrics[key].value ?? 0;
}

export function evaluateDataSufficiency(
  metrics: AnalyticsMetricSet,
  thresholds: SufficiencyThresholds = defaultSufficiencyThresholds
): SufficiencyResult {
  const impressions = value(metrics, "impressions");
  const clicks = value(metrics, "clicks");
  const conversions = value(metrics, "conversions");
  const reasons: string[] = [];

  if (impressions < thresholds.insufficientImpressionsBelow || clicks < thresholds.insufficientClicksBelow) {
    if (impressions < thresholds.insufficientImpressionsBelow) reasons.push(`impressions below ${thresholds.insufficientImpressionsBelow}`);
    if (clicks < thresholds.insufficientClicksBelow) reasons.push(`clicks below ${thresholds.insufficientClicksBelow}`);
    return { state: "insufficient_data", reasons, thresholds };
  }

  if (impressions < thresholds.lowVolumeImpressionsBelow || clicks < thresholds.lowVolumeClicksBelow) {
    if (impressions < thresholds.lowVolumeImpressionsBelow) reasons.push(`impressions below ${thresholds.lowVolumeImpressionsBelow}`);
    if (clicks < thresholds.lowVolumeClicksBelow) reasons.push(`clicks below ${thresholds.lowVolumeClicksBelow}`);
    return { state: "low_volume", reasons, thresholds };
  }

  if (
    impressions < thresholds.directionalImpressionsBelow ||
    clicks < thresholds.directionalClicksBelow ||
    conversions < thresholds.reliableConversionsAtLeast
  ) {
    if (impressions < thresholds.directionalImpressionsBelow) reasons.push(`impressions below ${thresholds.directionalImpressionsBelow}`);
    if (clicks < thresholds.directionalClicksBelow) reasons.push(`clicks below ${thresholds.directionalClicksBelow}`);
    if (conversions < thresholds.reliableConversionsAtLeast) reasons.push(`conversions below ${thresholds.reliableConversionsAtLeast}`);
    return { state: "directional_only", reasons, thresholds };
  }

  return { state: "reliable_enough_for_comparison", reasons: ["meets deterministic volume thresholds"], thresholds };
}
