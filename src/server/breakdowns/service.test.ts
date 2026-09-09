import { describe, expect, it } from "vitest";

import { getBreakdownDashboardData } from "./service";

describe("breakdown dashboard service", () => {
  it("returns grouped breakdown metrics for a supported combination", async () => {
    const data = await getBreakdownDashboardData({ breakdownKey: "age,gender", accountId: "act_100000000000001", preset: "last_7_days" });

    expect(data.selectedCapability.key).toBe("age,gender");
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.every((row) => row.metrics.clicks.value !== null)).toBe(true);
  });

  it("falls back to a safe supported breakdown if a requested combination is unsupported", async () => {
    const data = await getBreakdownDashboardData({ breakdownKey: "hourly_stats_aggregated_by_audience_time_zone" });

    expect(data.selectedCapability.key).toBe("age,gender");
    expect(data.unsupportedExamples.some((example) => example.key === "hourly_stats_aggregated_by_audience_time_zone")).toBe(true);
  });

  it("marks hourly reach as unavailable through availability summaries", async () => {
    const data = await getBreakdownDashboardData({ breakdownKey: "hourly_stats_aggregated_by_advertiser_time_zone" });

    expect(data.selectedCapability.key).toBe("hourly_stats_aggregated_by_advertiser_time_zone");
    expect(data.rows.some((row) => row.availabilitySummary.some((state) => state.includes("reach: unsupported")))).toBe(true);
  });
});
