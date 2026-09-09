export type MetricState =
  | "available"
  | "actual_zero"
  | "null_from_source"
  | "unavailable"
  | "unsupported"
  | "insufficient_data"
  | "api_error"
  | "partial";

export type MetricSource = "meta" | "derived" | "aggregate";

export type MetricValue<T = number> = {
  value: T | null;
  state: MetricState;
  source: MetricSource;
  reason?: string;
};

export type SourceMetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "linkClicks"
  | "outboundClicks"
  | "conversions"
  | "conversionValue";

export type DerivedMetricKey = "frequency" | "ctr" | "cpc" | "cpm" | "cpa" | "conversionRate" | "roas";

export type SourceMetricSet = Record<SourceMetricKey, MetricValue>;
export type DerivedMetricSet = Record<DerivedMetricKey, MetricValue>;

export type AnalyticsMetricSet = SourceMetricSet & DerivedMetricSet;

export type InsightMetricInput = Partial<Record<SourceMetricKey, number | null>> & {
  availability?: Partial<Record<SourceMetricKey, MetricState>>;
};
