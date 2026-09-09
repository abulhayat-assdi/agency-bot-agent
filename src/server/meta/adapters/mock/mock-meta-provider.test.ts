import { describe, expect, it } from "vitest";

import { MetaApiError } from "@/server/meta/errors";
import { createMockMetaAdsProvider } from "./mock-meta-provider";

describe("MockMetaAdsProvider", () => {
  it("paginates ad accounts with stable cursors", async () => {
    const provider = createMockMetaAdsProvider();
    const first = await provider.listAdAccounts({ limit: 1 });
    const second = await provider.listAdAccounts({ limit: 1, after: first.paging.cursors.after });

    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
  });

  it("returns a coherent account hierarchy", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    const campaigns = await provider.listCampaigns(account.id);
    const adSets = await provider.listAdSets(account.id, campaigns.data[0].id);
    const ads = await provider.listAds(account.id, adSets.data[0].id);
    const creative = await provider.getCreative(ads.data[0].id);

    expect(campaigns.data.length).toBeGreaterThan(0);
    expect(adSets.data.every((adSet) => adSet.campaignId === campaigns.data[0].id)).toBe(true);
    expect(ads.data.every((ad) => ad.adSetId === adSets.data[0].id)).toBe(true);
    expect(creative?.adId).toBe(ads.data[0].id);
  });

  it("keeps child ad metrics compatible with campaign totals", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    const campaign = (await provider.listCampaigns(account.id, { limit: 1 })).data[0];
    const adSets = await provider.listAdSets(account.id, campaign.id);
    const adSetIds = adSets.data.map((adSet) => adSet.id);
    const adsPages = await Promise.all(adSetIds.map((adSetId) => provider.listAds(account.id, adSetId)));
    const adIds = adsPages.flatMap((page) => page.data.map((ad) => ad.id));

    const campaignRows = await provider.getInsights({
      accountId: account.id,
      level: "campaign",
      entityIds: [campaign.id],
      dateRange: { since: "2026-09-01", until: "2026-09-01" }
    });
    const adRows = await provider.getInsights({
      accountId: account.id,
      level: "ad",
      entityIds: adIds,
      dateRange: { since: "2026-09-01", until: "2026-09-01" }
    });

    const childSpend = adRows.data.reduce((total, row) => total + (row.spend ?? 0), 0);
    const childImpressions = adRows.data.reduce((total, row) => total + (row.impressions ?? 0), 0);

    expect(campaignRows.data[0].spend).toBeCloseTo(childSpend, 2);
    expect(campaignRows.data[0].impressions).toBe(childImpressions);
    expect(adRows.data.every((row) => (row.clicks ?? 0) <= (row.impressions ?? 0))).toBe(true);
    expect(adRows.data.every((row) => (row.conversions ?? 0) <= (row.clicks ?? 0))).toBe(true);
  });

  it("returns breakdown rows and marks hourly reach unsupported", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    const hourly = await provider.getBreakdowns({
      accountId: account.id,
      level: "account",
      dateRange: { since: "2026-09-01", until: "2026-09-01" },
      breakdowns: ["hourly_stats_aggregated_by_advertiser_time_zone"],
      limit: 24
    });

    expect(hourly.data).toHaveLength(24);
    expect(hourly.data[0].reach).toBeNull();
    expect(hourly.data[0].availability.reach).toBe("unsupported");
  });

  it("throws typed errors for unsupported breakdowns and simulated rate limits", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];

    await expect(
      provider.getBreakdowns({
        accountId: account.id,
        level: "account",
        dateRange: { since: "2026-09-01", until: "2026-09-01" },
        breakdowns: ["age", "publisher_platform"]
      })
    ).rejects.toMatchObject({ kind: "unsupported_breakdown", retryable: false });

    const limitedProvider = createMockMetaAdsProvider({ simulateRateLimitAfter: 1 });
    await limitedProvider.listAdAccounts();
    await expect(limitedProvider.listAdAccounts()).rejects.toBeInstanceOf(MetaApiError);
    await expect(limitedProvider.listAdAccounts()).rejects.toMatchObject({ kind: "rate_limit", retryable: true });
  });
});
