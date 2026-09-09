import type { DerivedMetricSet, MetricValue, SourceMetricSet } from "@/server/analytics/metrics/types";
import { derivedMetric, isMetricUsable, unavailableMetric } from "@/server/analytics/metrics/value";

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function calculateRatio(
  numerator: MetricValue,
  denominator: MetricValue,
  multiplier: number,
  reasonLabel: string,
  decimals = 4
): MetricValue {
  if (!isMetricUsable(numerator)) return unavailableMetric(numerator.state, `${reasonLabel} unavailable because numerator is ${numerator.state}`);
  if (!isMetricUsable(denominator)) return unavailableMetric(denominator.state, `${reasonLabel} unavailable because denominator is ${denominator.state}`);
  if (denominator.value === 0) return unavailableMetric("insufficient_data", `${reasonLabel} unavailable because denominator is zero`);

  const value = round((numerator.value / denominator.value) * multiplier, decimals);
  return derivedMetric(value, value === 0 ? "actual_zero" : "available");
}

export function calculateCtr(clicks: MetricValue, impressions: MetricValue): MetricValue {
  return calculateRatio(clicks, impressions, 100, "CTR");
}

export function calculateCpc(spend: MetricValue, clicks: MetricValue): MetricValue {
  return calculateRatio(spend, clicks, 1, "CPC");
}

export function calculateCpm(spend: MetricValue, impressions: MetricValue): MetricValue {
  return calculateRatio(spend, impressions, 1000, "CPM");
}

export function calculateCpa(spend: MetricValue, conversions: MetricValue): MetricValue {
  return calculateRatio(spend, conversions, 1, "CPA");
}

export function calculateConversionRate(conversions: MetricValue, clicks: MetricValue): MetricValue {
  return calculateRatio(conversions, clicks, 100, "Conversion rate");
}

export function calculateRoas(conversionValue: MetricValue, spend: MetricValue): MetricValue {
  return calculateRatio(conversionValue, spend, 1, "ROAS");
}

export function calculateFrequency(impressions: MetricValue, reach: MetricValue): MetricValue {
  return calculateRatio(impressions, reach, 1, "Frequency");
}

export function calculateDerivedMetrics(source: SourceMetricSet): DerivedMetricSet {
  return {
    frequency: calculateFrequency(source.impressions, source.reach),
    ctr: calculateCtr(source.clicks, source.impressions),
    cpc: calculateCpc(source.spend, source.clicks),
    cpm: calculateCpm(source.spend, source.impressions),
    cpa: calculateCpa(source.spend, source.conversions),
    conversionRate: calculateConversionRate(source.conversions, source.clicks),
    roas: calculateRoas(source.conversionValue, source.spend)
  };
}
