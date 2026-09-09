import { describe, expect, it } from "vitest";

import { detectAnomalies, toAnalyticsMetricSet } from "@/server/analytics";

describe("anomaly detection", () => {
  it("detects configured metric movements deterministically", () => {
    const baseline = toAnalyticsMetricSet({
      spend: 1000,
      impressions: 100000,
      reach: 70000,
      clicks: 4000,
      conversions: 100,
      conversionValue: 5000
    });
    const current = toAnalyticsMetricSet({
      spend: 1700,
      impressions: 100000,
      reach: 70000,
      clicks: 2500,
      conversions: 60,
      conversionValue: 1800
    });

    const anomalies = detectAnomalies(current, baseline);
    const types = anomalies.map((anomaly) => anomaly.type);

    expect(types).toContain("cpa_spike");
    expect(types).toContain("ctr_drop");
    expect(types).toContain("roas_decline");
    expect(types).toContain("conversion_drop");
    expect(types).toContain("spend_change");
  });

  it("does not invent anomalies when required metrics are unavailable", () => {
    const baseline = toAnalyticsMetricSet({ spend: 100, impressions: 1000, clicks: 100, conversions: null, conversionValue: null });
    const current = toAnalyticsMetricSet({ spend: 100, impressions: 1000, clicks: 100, conversions: null, conversionValue: null });

    expect(detectAnomalies(current, baseline)).toEqual([]);
  });
});
