import { describe, expect, it } from "vitest";

import { evaluateDataSufficiency, toAnalyticsMetricSet } from "@/server/analytics";

describe("data sufficiency engine", () => {
  it("flags tiny samples as insufficient data", () => {
    const result = evaluateDataSufficiency(toAnalyticsMetricSet({ spend: 1, impressions: 2, clicks: 1, conversions: 1 }));

    expect(result.state).toBe("insufficient_data");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("labels enough volume and conversions as reliable enough for comparison", () => {
    const result = evaluateDataSufficiency(
      toAnalyticsMetricSet({ spend: 1000, impressions: 10000, clicks: 400, conversions: 25, conversionValue: 3000 })
    );

    expect(result.state).toBe("reliable_enough_for_comparison");
  });

  it("does not treat low conversions as statistically significant", () => {
    const result = evaluateDataSufficiency(
      toAnalyticsMetricSet({ spend: 1000, impressions: 10000, clicks: 400, conversions: 2, conversionValue: 3000 })
    );

    expect(result.state).toBe("directional_only");
    expect(result.reasons).toContain("conversions below 10");
  });
});
