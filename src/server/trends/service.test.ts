import { describe, expect, it } from "vitest";

import { getTrendDashboardData } from "./service";

describe("trend dashboard service", () => {
  it("builds campaign period comparisons with top and bottom rankings", async () => {
    const data = await getTrendDashboardData({ accountId: "act_100000000000001", entityLevel: "campaign", metricKey: "roas", preset: "last_7_days" });

    expect(data.entityLevel).toBe("campaign");
    expect(data.entities.length).toBeGreaterThan(0);
    expect(data.topEntities.length).toBeGreaterThan(0);
    expect(data.bottomEntities.length).toBeGreaterThan(0);
    expect(data.accountComparisons.roas.direction).toMatch(/up|down|flat|not_comparable/);
  });

  it("supports ad set and ad comparison levels", async () => {
    const adsets = await getTrendDashboardData({ entityLevel: "adset", metricKey: "cpa" });
    const ads = await getTrendDashboardData({ entityLevel: "ad", metricKey: "ctr" });

    expect(adsets.entities.every((entity) => entity.level === "adset")).toBe(true);
    expect(ads.entities.every((entity) => entity.level === "ad")).toBe(true);
    expect(ads.entities.every((entity) => entity.reportHref.startsWith("/ads/"))).toBe(true);
  });

  it("uses previous equivalent periods and account timezone", async () => {
    const data = await getTrendDashboardData({ accountId: "act_100000000000001", preset: "last_7_days" });

    expect(data.range).toEqual({ since: "2026-09-04", until: "2026-09-10", timezone: "Asia/Dhaka" });
    expect(data.previousRange).toEqual({ since: "2026-08-28", until: "2026-09-03", timezone: "Asia/Dhaka" });
    expect(data.dailyTrend).toHaveLength(7);
  });
});
