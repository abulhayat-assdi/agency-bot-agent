import { describe, expect, it } from "vitest";

import { getAdReport, getAdSetReport, getCampaignReport } from "./mock-report-data";

describe("deep report data service", () => {
  it("builds campaign reports with child ad sets and breakdown previews", async () => {
    const report = await getCampaignReport("100000000000001101");

    expect(report?.context.campaign?.id).toBe("100000000000001101");
    expect(report?.children.length).toBeGreaterThan(0);
    expect(report?.children.every((child) => child.metrics.impressions.value !== null)).toBe(true);
    expect(report?.breakdowns.map((breakdown) => breakdown.key)).toContain("age,gender");
  });

  it("builds ad set reports with child ad drilldown rows", async () => {
    const report = await getAdSetReport("10000000000000110111");

    expect(report?.context.adSet?.id).toBe("10000000000000110111");
    expect(report?.children.length).toBe(2);
    expect(report?.children.every((child) => child.id.startsWith("10000000000000110111"))).toBe(true);
  });

  it("builds individual ad reports with creative metadata and selected-ad-only context", async () => {
    const report = await getAdReport("1000000000000011011119");

    expect(report?.context.ad?.id).toBe("1000000000000011011119");
    expect(report?.context.creative?.adId).toBe("1000000000000011011119");
    expect(report?.children).toHaveLength(0);
    expect(report?.metrics.clicks.value).toBeLessThanOrEqual(report?.metrics.impressions.value ?? 0);
  });
});
