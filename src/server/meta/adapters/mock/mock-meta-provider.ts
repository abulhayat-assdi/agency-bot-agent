import { MetaApiError } from "@/server/meta/errors";
import { breakdownCapabilities } from "@/server/breakdowns/capabilities";
import { aggregateInsightRows, createAdDailyMetrics, nameForEntity, parentIdsForLevel } from "@/server/meta/adapters/mock/metrics";
import { eachDateInRange } from "@/server/meta/adapters/mock/date-utils";
import { findBreakdownCapability, getBreakdownKey, splitInsightByBreakdown } from "@/server/meta/adapters/mock/breakdowns";
import { mockAccounts, mockAds, mockAdSets, mockCampaigns, mockCreatives } from "@/server/meta/adapters/mock/fixtures";
import { paginate } from "@/server/meta/pagination";
import type {
  MetaAdsProvider,
  MetaBreakdownQuery,
  MetaBreakdownRow,
  MetaCurrentUser,
  MetaConnectionHealth,
  MetaBreakdownCapabilityInfo,
  MetaEntityLevel,
  MetaInsightRow,
  MetaInsightsQuery,
  MetaPage,
  MetaPaging
} from "@/server/meta/types";

export type MockMetaProviderOptions = {
  simulateRateLimitAfter?: number;
  forceError?: "permission" | "transient" | "invalid_request";
};

export class MockMetaAdsProvider implements MetaAdsProvider {
  private requestCount = 0;

  constructor(private readonly options: MockMetaProviderOptions = {}) {}

  private checkSimulation() {
    this.requestCount += 1;

    if (this.options.simulateRateLimitAfter && this.requestCount > this.options.simulateRateLimitAfter) {
      throw new MetaApiError("Mock Meta rate limit exceeded", "rate_limit", "4", true, {
        header: "x-fb-ads-insights-throttle",
        appIdUtilPct: 100
      });
    }

    if (this.options.forceError === "permission") {
      throw new MetaApiError("Mock permission error", "permission", "200", false);
    }
    if (this.options.forceError === "transient") {
      throw new MetaApiError("Mock transient API failure", "transient", "2", true);
    }
    if (this.options.forceError === "invalid_request") {
      throw new MetaApiError("Mock invalid request", "invalid_request", "100", false);
    }
  }

  async listAdAccounts(paging?: MetaPaging) {
    this.checkSimulation();
    return paginate(mockAccounts, paging);
  }

  async getCurrentUser(): Promise<MetaCurrentUser> {
    this.checkSimulation();
    return { id: "mock_user_1", name: "Mock Agency Owner" };
  }

  async getAdAccount(accountId: string) {
    this.checkSimulation();
    return mockAccounts.find((item) => item.id === accountId || item.accountId === accountId) ?? null;
  }

  async getAd(accountId: string, adId: string) {
    this.checkSimulation();
    this.assertAccount(accountId);
    return mockAds.find((ad) => ad.accountId === this.assertAccount(accountId).id && ad.id === adId) ?? null;
  }

  async getAvailableBreakdowns(level?: MetaEntityLevel): Promise<MetaBreakdownCapabilityInfo[]> {
    this.checkSimulation();
    return breakdownCapabilities
      .filter((capability) => !level || capability.supportedLevels.includes(level))
      .map((capability) => ({
        key: capability.key,
        label: capability.label,
        dimensions: capability.dimensions,
        supported: capability.supported,
        supportedLevels: capability.supportedLevels,
        notes: capability.notes
      }));
  }

  async healthCheck(): Promise<MetaConnectionHealth> {
    try {
      this.checkSimulation();
      const accounts = mockAccounts.length;
      return { status: "connected", user: { id: "mock_user_1", name: "Mock Agency Owner" }, adAccountCount: accounts, checkedAt: new Date().toISOString() };
    } catch {
      return { status: "api_error", checkedAt: new Date().toISOString() };
    }
  }

  async listCampaigns(accountId: string, paging?: MetaPaging) {
    this.checkSimulation();
    this.assertAccount(accountId);
    return paginate(
      mockCampaigns.filter((campaign) => campaign.accountId === accountId),
      paging
    );
  }

  async listAdSets(accountId: string, campaignId?: string, paging?: MetaPaging) {
    this.checkSimulation();
    this.assertAccount(accountId);
    return paginate(
      mockAdSets.filter((adSet) => adSet.accountId === accountId && (!campaignId || adSet.campaignId === campaignId)),
      paging
    );
  }

  async listAds(accountId: string, adSetId?: string, paging?: MetaPaging) {
    this.checkSimulation();
    this.assertAccount(accountId);
    return paginate(
      mockAds.filter((ad) => ad.accountId === accountId && (!adSetId || ad.adSetId === adSetId)),
      paging
    );
  }

  async getCreative(adId: string) {
    this.checkSimulation();
    return mockCreatives.find((creative) => creative.adId === adId) ?? null;
  }

  async getInsights(query: MetaInsightsQuery): Promise<MetaPage<MetaInsightRow>> {
    this.checkSimulation();
    const account = this.assertAccount(query.accountId);
    const rows = this.buildInsightRows(query.level, query.accountId, query.dateRange, query.entityIds);

    return paginate(
      rows.map((row) => ({ ...row, timezone: account.timezone, currency: account.currency })),
      { limit: query.limit, after: query.after }
    );
  }

  async getBreakdowns(query: MetaBreakdownQuery): Promise<MetaPage<MetaBreakdownRow>> {
    this.checkSimulation();
    const capability = findBreakdownCapability(query.breakdowns);
    const key = getBreakdownKey(query.breakdowns);

    if (!capability || !capability.supported) {
      throw new MetaApiError(`Unsupported mock breakdown combination: ${key}`, "unsupported_breakdown", "100", false, {
        breakdowns: query.breakdowns
      });
    }

    const baseRows = this.buildInsightRows(query.level, query.accountId, query.dateRange, query.entityIds);
    const rows = baseRows.flatMap((row) => splitInsightByBreakdown(row, query.breakdowns));
    return paginate(rows, { limit: query.limit, after: query.after });
  }

  private assertAccount(accountId: string) {
    const account = mockAccounts.find((item) => item.id === accountId || item.accountId === accountId);
    if (!account) {
      throw new MetaApiError("Mock ad account not found", "not_found", "190", false, { accountId });
    }
    return account;
  }

  private buildInsightRows(level: MetaEntityLevel, accountId: string, dateRange: { since: string; until: string }, entityIds?: string[]) {
    const account = this.assertAccount(accountId);
    const dates = eachDateInRange(dateRange);
    const accountAds = mockAds.filter((ad) => ad.accountId === account.id);
    const rows: MetaInsightRow[] = [];

    for (const date of dates) {
      const adRows = accountAds.map((ad) => createAdDailyMetrics(ad, account, date));

      if (level === "ad") {
        rows.push(...this.filterEntityRows(adRows, entityIds));
        continue;
      }

      const grouped = new Map<string, MetaInsightRow[]>();
      for (const ad of accountAds) {
        const parentId = parentIdsForLevel(ad, level);
        if (entityIds && !entityIds.includes(parentId)) continue;
        const row = adRows.find((item) => item.entityId === ad.id);
        if (!row) continue;
        grouped.set(parentId, [...(grouped.get(parentId) ?? []), row]);
      }

      for (const [entityId, groupRows] of grouped.entries()) {
        rows.push(aggregateInsightRows(groupRows, level, entityId, nameForEntity(level, entityId, account.name)));
      }
    }

    return rows;
  }

  private filterEntityRows(rows: MetaInsightRow[], entityIds?: string[]) {
    if (!entityIds?.length) return rows;
    return rows.filter((row) => entityIds.includes(row.entityId));
  }
}

export function createMockMetaAdsProvider(options?: MockMetaProviderOptions): MetaAdsProvider {
  return new MockMetaAdsProvider(options);
}
