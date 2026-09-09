import { describe, expect, it } from "vitest";

import { getDashboardData } from "./mock-dashboard-data";

describe("dashboard data service", () => {
  it("separates financial summaries by currency", async () => {
    const data = await getDashboardData({ preset: "last_7_days" });

    expect(data.currencySummaries.map((summary) => summary.currency).sort()).toEqual(["BDT", "USD"]);
    expect(data.caveats.some((caveat) => caveat.includes("Multiple currencies"))).toBe(true);
  });

  it("filters by client and account without hard-coded single-account assumptions", async () => {
    const data = await getDashboardData({ preset: "last_7_days", clientId: "northstar-commerce" });

    expect(data.selectedAccounts).toHaveLength(1);
    expect(data.accountSummaries[0].client.id).toBe("northstar-commerce");
    expect(data.currencySummaries).toHaveLength(1);
  });

  it("aggregates campaign rows across the selected period", async () => {
    const data = await getDashboardData({ preset: "last_7_days", accountId: "act_100000000000001" });
    const campaignIds = new Set(data.campaignSummaries.map((campaign) => campaign.id));

    expect(data.campaignSummaries.length).toBe(campaignIds.size);
    expect(data.campaignSummaries.length).toBeGreaterThan(0);
    expect(data.campaignSummaries.every((campaign) => campaign.metrics.impressions.value !== null)).toBe(true);
  });
});
