export type MetaEntityLevel = "account" | "campaign" | "adset" | "ad";
export type MetaAvailabilityState = "available" | "actual_zero" | "null_from_source" | "unavailable" | "unsupported" | "insufficient_data" | "api_error" | "partial";

export type MetaDateRange = {
  since: string;
  until: string;
};

export type MetaPaging = {
  limit?: number;
  after?: string;
};

export type MetaPage<T> = {
  data: T[];
  paging: {
    cursors: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
};

export type MetaAdAccount = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  timezone: string;
  accessStatus: "connected" | "needs_attention" | "revoked" | "unknown";
};

export type MetaCampaign = {
  id: string;
  accountId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  buyingType: string;
};

export type MetaAdSet = {
  id: string;
  accountId: string;
  campaignId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  optimizationGoal: string;
  billingEvent: string;
  attributionSpec: Record<string, unknown>;
};

export type MetaAd = {
  id: string;
  accountId: string;
  campaignId: string;
  adSetId: string;
  creativeId: string;
  name: string;
  status: string;
  effectiveStatus: string;
};

export type MetaCreative = {
  id: string;
  adId: string;
  name: string;
  pageId?: string;
  instagramActorId?: string;
  thumbnailUrl?: string;
  objectType: "video" | "image" | "carousel";
  metadata: Record<string, unknown>;
};

export type MetaMetrics = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  outboundClicks: number | null;
  conversions: number | null;
  conversionValue: number | null;
  videoMetrics?: Record<string, number | null>;
  engagementMetrics?: Record<string, number | null>;
  actionMetrics?: Record<string, number | null>;
};

export type MetaInsightRow = MetaMetrics & {
  accountId: string;
  level: MetaEntityLevel;
  entityId: string;
  entityName: string;
  dateStart: string;
  dateStop: string;
  timezone: string;
  currency: string;
  attributionContext: Record<string, unknown>;
  availability: Partial<Record<keyof MetaMetrics, MetaAvailabilityState>>;
};

export type MetaBreakdownRow = MetaInsightRow & {
  breakdownKey: string;
  breakdownValues: Record<string, string>;
};

export type MetaInsightsQuery = {
  accountId: string;
  level: MetaEntityLevel;
  dateRange: MetaDateRange;
  entityIds?: string[];
  timeIncrement?: "all_days" | 1;
} & MetaPaging;

export type MetaBreakdownQuery = MetaInsightsQuery & {
  breakdowns: string[];
};

export interface MetaAdsProvider {
  listAdAccounts(paging?: MetaPaging): Promise<MetaPage<MetaAdAccount>>;
  listCampaigns(accountId: string, paging?: MetaPaging): Promise<MetaPage<MetaCampaign>>;
  listAdSets(accountId: string, campaignId?: string, paging?: MetaPaging): Promise<MetaPage<MetaAdSet>>;
  listAds(accountId: string, adSetId?: string, paging?: MetaPaging): Promise<MetaPage<MetaAd>>;
  getCreative(adId: string): Promise<MetaCreative | null>;
  getInsights(query: MetaInsightsQuery): Promise<MetaPage<MetaInsightRow>>;
  getBreakdowns(query: MetaBreakdownQuery): Promise<MetaPage<MetaBreakdownRow>>;
}
