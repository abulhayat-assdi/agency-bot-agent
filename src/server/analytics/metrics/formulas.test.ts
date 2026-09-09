import { describe, expect, it } from "vitest";

import {
  calculateCpa,
  calculateCpc,
  calculateCpm,
  calculateConversionRate,
  calculateCtr,
  calculateFrequency,
  calculateRoas,
  toAnalyticsMetricSet
} from "@/server/analytics";
import { metricValue } from "@/server/analytics/metrics/value";

describe("deterministic metric formulas", () => {
  it("calculates CTR, CPC, CPM, CPA, conversion rate, ROAS, and frequency", () => {
    const spend = metricValue(100);
    const impressions = metricValue(10000);
    const reach = metricValue(8000);
    const clicks = metricValue(500);
    const conversions = metricValue(25);
    const conversionValue = metricValue(400);

    expect(calculateCtr(clicks, impressions).value).toBe(5);
    expect(calculateCpc(spend, clicks).value).toBe(0.2);
    expect(calculateCpm(spend, impressions).value).toBe(10);
    expect(calculateCpa(spend, conversions).value).toBe(4);
    expect(calculateConversionRate(conversions, clicks).value).toBe(5);
    expect(calculateRoas(conversionValue, spend).value).toBe(4);
    expect(calculateFrequency(impressions, reach).value).toBe(1.25);
  });

  it("does not divide by zero", () => {
    const spend = metricValue(100);
    const zeroClicks = metricValue(0);

    const cpc = calculateCpc(spend, zeroClicks);

    expect(cpc.value).toBeNull();
    expect(cpc.state).toBe("insufficient_data");
  });

  it("does not convert unavailable values to zero", () => {
    const metrics = toAnalyticsMetricSet({
      spend: 100,
      impressions: null,
      clicks: 10,
      conversions: null,
      conversionValue: null,
      availability: {
        impressions: "unavailable",
        conversions: "unsupported",
        conversionValue: "null_from_source"
      }
    });

    expect(metrics.impressions.value).toBeNull();
    expect(metrics.impressions.state).toBe("unavailable");
    expect(metrics.ctr.value).toBeNull();
    expect(metrics.ctr.state).toBe("unavailable");
    expect(metrics.cpa.state).toBe("unsupported");
    expect(metrics.roas.state).toBe("null_from_source");
  });

  it("marks legitimate derived zero as actual zero", () => {
    const ctr = calculateCtr(metricValue(0), metricValue(1000));

    expect(ctr.value).toBe(0);
    expect(ctr.state).toBe("actual_zero");
  });
});
