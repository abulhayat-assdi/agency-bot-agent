import { describe, expect, it } from "vitest";

import { calculateTrend, rankEntities, toAnalyticsMetricSet } from "@/server/analytics";

describe("trend and ranking analytics", () => {
  it("sorts trend points by account-local reporting date and compares first to last", () => {
    const trend = calculateTrend(
      [
        { date: "2026-09-02", metrics: toAnalyticsMetricSet({ spend: 100, impressions: 1000, clicks: 100 }) },
        { date: "2026-09-01", metrics: toAnalyticsMetricSet({ spend: 50, impressions: 1000, clicks: 100 }) }
      ],
      "spend"
    );

    expect(trend.points.map((point) => point.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(trend.firstToLast.absoluteChange.value).toBe(50);
  });

  it("ranks only entities with usable metric values", () => {
    const ranked = rankEntities(
      [
        { id: "a", name: "A", metrics: toAnalyticsMetricSet({ spend: 50, impressions: 1000, clicks: 100, conversions: 5, conversionValue: 250 }) },
        { id: "b", name: "B", metrics: toAnalyticsMetricSet({ spend: 50, impressions: 1000, clicks: 100, conversions: 5, conversionValue: null }) },
        { id: "c", name: "C", metrics: toAnalyticsMetricSet({ spend: 50, impressions: 1000, clicks: 100, conversions: 5, conversionValue: 500 }) }
      ],
      "roas"
    );

    expect(ranked.map((entity) => entity.id)).toEqual(["c", "a"]);
    expect(ranked[0].rank).toBe(1);
  });
});
