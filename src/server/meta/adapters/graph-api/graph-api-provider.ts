import { GraphApiHttpClient, type GraphApiHttpClientOptions } from "@/server/meta/adapters/graph-api/http-client";
import type {
  GraphActionMetric,
  GraphAd,
  GraphAdAccount,
  GraphAdSet,
  GraphCampaign,
  GraphCreative,
  GraphInsightRow
} from "@/server/meta/adapters/graph-api/types";
import { breakdownCapabilities, validateBreakdownRequest } from "@/server/breakdowns/capabilities";
import { MetaApiError } from "@/server/meta/errors";
import type {
  MetaAd,
  MetaAdAccount,
  MetaAdsProvider,
  MetaAdSet,
  MetaAvailabilityState,
  MetaBreakdownCapabilityInfo,
  MetaBreakdownQuery,
  MetaBreakdownRow,
  MetaCampaign,
  MetaConnectionHealth,
  MetaCreative,
  MetaCurrentUser,
  MetaEntityLevel,
  MetaInsightRow,
  MetaInsightsQuery,
  MetaMetrics,
  MetaPage,
  MetaPaging
} from "@/server/meta/types";

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS = "id,account_id,name,status,effective_status,objective,buying_type,start_time,stop_time";
const ADSET_FIELDS = "id,account_id,campaign_id,name,status,effective_status,optimization_goal,billing_event,attribution_spec,start_time,end_time";
const AD_FIELDS = "id,account_id,campaign_id,adset_id,name,status,effective_status,creative{id}";
const CREATIVE_FIELDS = "id,name,thumbnail_url,object_type,object_story_spec";
const INSIGHT_FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "inline_link_clicks",
  "outbound_clicks",
  "actions",
  "action_values",
  "cost_per_action_type",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  "landing_page_views"
].join(",");

const CONVERSION_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "complete_registration",
  "subscribe"
]);

const VIDEO_METRIC_KEYS = new Set([
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_p95_watched_actions",
  "video_avg_time_watched_actions",
  "video_play_actions",
  "video_thruplay_watched_actions"
]);

function cursorPaging(paging?: MetaPaging) {
  return { limit: paging?.limit ?? 100, after: paging?.after };
}

function toMetaPage<T>(data: T[], paging?: { cursors?: { before?: string; after?: string }; next?: string }): MetaPage<T> {
  return {
    data,
    paging: {
      cursors: {
        before: paging?.cursors?.before,
        after: paging?.cursors?.after
      },
      next: paging?.next
    }
  };
}

function accountStatus(status?: number): MetaAdAccount["accessStatus"] {
  if (status === 1) return "connected";
  if (status === 2 || status === 3) return "needs_attention";
  return "unknown";
}

function parseNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeActionMetrics(actions: GraphInsightRow["actions"]): Record<string, number | null> {
  const normalized: Record<string, number | null> = {};
  for (const action of actions ?? []) {
    if (!action.action_type) continue;
    // Never overwrite with a worse value; sum duplicates deterministically.
    const parsed = parseNumber(action.value);
    if (parsed === null) {
      if (!(action.action_type in normalized)) normalized[action.action_type] = null;
      continue;
    }
    normalized[action.action_type] = (normalized[action.action_type] ?? 0) + parsed;
  }
  return normalized;
}

function sumActions(actions: GraphInsightRow["actions"], actionTypes = CONVERSION_ACTION_TYPES) {
  if (!actions) return null;
  let found = false;
  const total = actions.reduce((sum, action) => {
    if (!action.action_type || !actionTypes.has(action.action_type)) return sum;
    found = true;
    return sum + (parseNumber(action.value) ?? 0);
  }, 0);
  return found ? total : null;
}

function sumOutboundClicks(actions: GraphInsightRow["outbound_clicks"]) {
  if (!actions) return null;
  if (actions.length === 0) return null;
  return actions.reduce((sum, action) => sum + (parseNumber(action.value) ?? 0), 0);
}

function extractVideoMetrics(row: GraphInsightRow): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};
  for (const key of VIDEO_METRIC_KEYS) {
    const raw = row[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      // Meta returns some video metrics as action arrays.
      const total = (raw as Array<{ value?: string }>).reduce((sum, item) => sum + (parseNumber(item.value) ?? 0), 0);
      metrics[key] = total;
    } else {
      metrics[key] = parseNumber(raw as string | number | null);
    }
  }
  return metrics;
}

function availabilityForMetric(value: number | null, sourcePresent: boolean): MetaAvailabilityState {
  if (!sourcePresent) return "null_from_source";
  if (value === null) return "null_from_source";
  if (value === 0) return "actual_zero";
  return "available";
}

function availabilityFor(row: GraphInsightRow, metrics: MetaMetrics): Partial<Record<keyof MetaMetrics, MetaAvailabilityState>> {
  const hasActions = Array.isArray(row.actions);
  const hasActionValues = Array.isArray(row.action_values);
  return {
    spend: availabilityForMetric(metrics.spend, row.spend !== undefined),
    impressions: availabilityForMetric(metrics.impressions, row.impressions !== undefined),
    reach: availabilityForMetric(metrics.reach, row.reach !== undefined),
    frequency: availabilityForMetric(metrics.frequency, row.frequency !== undefined),
    clicks: availabilityForMetric(metrics.clicks, row.clicks !== undefined),
    linkClicks: availabilityForMetric(metrics.linkClicks, row.inline_link_clicks !== undefined),
    outboundClicks: availabilityForMetric(metrics.outboundClicks, row.outbound_clicks !== undefined),
    ctr: availabilityForMetric(metrics.ctr, row.ctr !== undefined),
    cpc: availabilityForMetric(metrics.cpc, row.cpc !== undefined),
    cpm: availabilityForMetric(metrics.cpm, row.cpm !== undefined),
    conversions: hasActions ? (metrics.conversions === null ? "unavailable" : metrics.conversions === 0 ? "actual_zero" : "available") : "null_from_source",
    conversionValue: hasActionValues
      ? metrics.conversionValue === null
        ? "unavailable"
        : metrics.conversionValue === 0
          ? "actual_zero"
          : "available"
      : "null_from_source"
  };
}

function entityIdFor(row: GraphInsightRow, level: MetaEntityLevel, accountId: string) {
  if (level === "account") return row.account_id ? `act_${row.account_id.replace(/^act_/, "")}` : accountId;
  if (level === "campaign") return row.campaign_id ?? "unknown_campaign";
  if (level === "adset") return row.adset_id ?? "unknown_adset";
  return row.ad_id ?? "unknown_ad";
}

function entityNameFor(row: GraphInsightRow, level: MetaEntityLevel) {
  if (level === "account") return row.account_name ?? row.account_id ?? "Meta ad account";
  if (level === "campaign") return row.campaign_name ?? row.campaign_id ?? "Meta campaign";
  if (level === "adset") return row.adset_name ?? row.adset_id ?? "Meta ad set";
  return row.ad_name ?? row.ad_id ?? "Meta ad";
}

function insightRowToMeta(row: GraphInsightRow, query: MetaInsightsQuery, account?: MetaAdAccount): MetaInsightRow {
  const actionMetrics = normalizeActionMetrics(row.actions);
  const metrics: MetaMetrics = {
    spend: parseNumber(row.spend),
    impressions: parseNumber(row.impressions),
    reach: parseNumber(row.reach),
    frequency: parseNumber(row.frequency),
    clicks: parseNumber(row.clicks),
    ctr: parseNumber(row.ctr),
    cpc: parseNumber(row.cpc),
    cpm: parseNumber(row.cpm),
    linkClicks: parseNumber(row.inline_link_clicks),
    outboundClicks: sumOutboundClicks(row.outbound_clicks),
    conversions: sumActions(row.actions),
    conversionValue: sumActions(row.action_values),
    videoMetrics: extractVideoMetrics(row),
    engagementMetrics: {},
    actionMetrics
  };

  // Preserve landing_page_views without promoting it to a core conversion.
  const landingRaw = row.landing_page_views as string | number | GraphActionMetric[] | undefined;
  const landingPageViews = Array.isArray(landingRaw)
    ? landingRaw.reduce((sum, item) => sum + (parseNumber((item as { value?: string }).value) ?? 0), 0)
    : parseNumber(landingRaw as string | number | null | undefined);
  if (landingPageViews !== null || row.landing_page_views !== undefined) {
    metrics.engagementMetrics = { ...(metrics.engagementMetrics ?? {}), landing_page_views: landingPageViews };
  }

  const isHourly = query.timeIncrement === "hourly";
  const availability = availabilityFor(row, metrics);
  if (isHourly) {
    // Meta hourly breakdowns do not support reach/frequency; never present zeros as truth.
    if (availability.reach === "actual_zero" || availability.reach === "available") availability.reach = "unsupported";
    if (availability.frequency === "actual_zero" || availability.frequency === "available") availability.frequency = "unsupported";
    metrics.reach = null;
    metrics.frequency = null;
  }

  return {
    ...metrics,
    accountId: account?.id ?? query.accountId,
    level: query.level,
    entityId: entityIdFor(row, query.level, query.accountId),
    entityName: entityNameFor(row, query.level),
    dateStart: row.date_start ?? query.dateRange.since,
    dateStop: row.date_stop ?? query.dateRange.until,
    timezone: account?.timezone ?? "UTC",
    currency: account?.currency ?? "USD",
    attributionContext: {
      actionReportTime: "impression",
      actionAttributionWindows: ["default"],
      source: "meta_graph_api"
    },
    availability
  };
}

function objectType(value?: string): MetaCreative["objectType"] {
  const normalized = value?.toLowerCase();
  if (normalized?.includes("video")) return "video";
  if (normalized?.includes("carousel")) return "carousel";
  return "image";
}

export type GraphApiMetaAdsProviderOptions = GraphApiHttpClientOptions;

export class GraphApiMetaAdsProvider implements MetaAdsProvider {
  private readonly client: GraphApiHttpClient;
  private readonly accountCache = new Map<string, MetaAdAccount>();

  constructor(options: GraphApiMetaAdsProviderOptions) {
    this.client = new GraphApiHttpClient(options);
  }

  async getCurrentUser(): Promise<MetaCurrentUser> {
    const me = await this.client.getObject<{ id: string; name?: string }>("/me", { fields: "id,name" });
    return { id: me.id, name: me.name ?? me.id };
  }

  async getAdAccount(accountId: string): Promise<MetaAdAccount | null> {
    try {
      return await this.lookupAccount(accountId);
    } catch (error) {
      if (error instanceof MetaApiError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async getAd(accountId: string, adId: string): Promise<MetaAd | null> {
    try {
      const ad = await this.client.getObject<GraphAd>(`/${adId}`, { fields: AD_FIELDS });
      const mappedAccountId = ad.account_id ? `act_${ad.account_id.replace(/^act_/, "")}` : accountId;
      if (mappedAccountId !== accountId) return null;
      return {
        id: ad.id ?? adId,
        accountId,
        campaignId: ad.campaign_id ?? "unknown_campaign",
        adSetId: ad.adset_id ?? "unknown_adset",
        creativeId: ad.creative?.id ?? "unknown_creative",
        name: ad.name ?? adId,
        status: ad.status ?? "UNKNOWN",
        effectiveStatus: ad.effective_status ?? ad.status ?? "UNKNOWN"
      };
    } catch (error) {
      if (error instanceof MetaApiError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async getAvailableBreakdowns(level?: MetaEntityLevel): Promise<MetaBreakdownCapabilityInfo[]> {
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
    const checkedAt = new Date().toISOString();
    try {
      const user = await this.getCurrentUser();
      const page = await this.client.getPage<GraphAdAccount>("/me/adaccounts", { fields: "id", limit: 1 });
      return { status: "connected", user, adAccountCount: (page.data ?? []).length, checkedAt };
    } catch (error) {
      if (error instanceof MetaApiError) {
        if (error.kind === "authentication") return { status: "authentication_failed", checkedAt };
        if (error.kind === "permission") return { status: "permission_denied", checkedAt };
      }
      return { status: "api_error", checkedAt };
    }
  }

  async listAdAccounts(paging?: MetaPaging): Promise<MetaPage<MetaAdAccount>> {
    const page = await this.client.getPage<GraphAdAccount>("/me/adaccounts", { fields: ACCOUNT_FIELDS, ...cursorPaging(paging) });
    const data = (page.data ?? []).map((account) => {
      const id = account.id.startsWith("act_") ? account.id : `act_${account.account_id ?? account.id}`;
      const mapped: MetaAdAccount = {
        id,
        accountId: account.account_id ?? id.replace(/^act_/, ""),
        name: account.name ?? id,
        currency: account.currency ?? "USD",
        timezone: account.timezone_name ?? "UTC",
        accessStatus: accountStatus(account.account_status)
      };
      this.accountCache.set(mapped.id, mapped);
      return mapped;
    });
    return toMetaPage(data, page.paging);
  }

  async listCampaigns(accountId: string, paging?: MetaPaging): Promise<MetaPage<MetaCampaign>> {
    const page = await this.client.getPage<GraphCampaign>(`/${accountId}/campaigns`, { fields: CAMPAIGN_FIELDS, ...cursorPaging(paging) });
    return toMetaPage(
      (page.data ?? []).map((campaign) => ({
        id: campaign.id,
        accountId,
        name: campaign.name ?? campaign.id,
        status: campaign.status ?? "UNKNOWN",
        effectiveStatus: campaign.effective_status ?? campaign.status ?? "UNKNOWN",
        objective: campaign.objective ?? "UNKNOWN",
        buyingType: campaign.buying_type ?? "UNKNOWN"
      })),
      page.paging
    );
  }

  async listAdSets(accountId: string, campaignId?: string, paging?: MetaPaging): Promise<MetaPage<MetaAdSet>> {
    const page = await this.client.getPage<GraphAdSet>(`/${accountId}/adsets`, { fields: ADSET_FIELDS, filtering: campaignId ? JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]) : undefined, ...cursorPaging(paging) });
    return toMetaPage(
      (page.data ?? []).map((adSet) => ({
        id: adSet.id,
        accountId,
        campaignId: adSet.campaign_id ?? campaignId ?? "unknown_campaign",
        name: adSet.name ?? adSet.id,
        status: adSet.status ?? "UNKNOWN",
        effectiveStatus: adSet.effective_status ?? adSet.status ?? "UNKNOWN",
        optimizationGoal: adSet.optimization_goal ?? "UNKNOWN",
        billingEvent: adSet.billing_event ?? "UNKNOWN",
        attributionSpec: { source: "meta_graph_api", spec: adSet.attribution_spec ?? [] }
      })),
      page.paging
    );
  }

  async listAds(accountId: string, adSetId?: string, paging?: MetaPaging): Promise<MetaPage<MetaAd>> {
    const page = await this.client.getPage<GraphAd>(`/${accountId}/ads`, { fields: AD_FIELDS, filtering: adSetId ? JSON.stringify([{ field: "adset.id", operator: "EQUAL", value: adSetId }]) : undefined, ...cursorPaging(paging) });
    return toMetaPage(
      (page.data ?? []).map((ad) => ({
        id: ad.id,
        accountId,
        campaignId: ad.campaign_id ?? "unknown_campaign",
        adSetId: ad.adset_id ?? adSetId ?? "unknown_adset",
        creativeId: ad.creative?.id ?? "unknown_creative",
        name: ad.name ?? ad.id,
        status: ad.status ?? "UNKNOWN",
        effectiveStatus: ad.effective_status ?? ad.status ?? "UNKNOWN"
      })),
      page.paging
    );
  }

  async getCreative(adId: string): Promise<MetaCreative | null> {
    const ad = await this.client.getObject<GraphAd>(`/${adId}`, { fields: AD_FIELDS });
    const creativeId = ad.creative?.id;
    if (!creativeId) return null;
    const creative = await this.client.getObject<GraphCreative>(`/${creativeId}`, { fields: CREATIVE_FIELDS });
    return {
      id: creative.id ?? creativeId,
      adId,
      name: creative.name ?? creative.id ?? creativeId,
      pageId: creative.object_story_spec?.page_id,
      instagramActorId: creative.object_story_spec?.instagram_actor_id,
      thumbnailUrl: creative.thumbnail_url,
      objectType: objectType(creative.object_type),
      metadata: {
        source: "meta_graph_api",
        objectType: creative.object_type ?? null
      }
    };
  }

  async getInsights(query: MetaInsightsQuery): Promise<MetaPage<MetaInsightRow>> {
    const account = this.accountCache.get(query.accountId) ?? (await this.lookupAccount(query.accountId));
    const page = await this.client.getPage<GraphInsightRow>(`/${query.accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      level: query.level,
      ...(query.datePreset ? { date_preset: query.datePreset } : { time_range: JSON.stringify({ since: query.dateRange.since, until: query.dateRange.until }) }),
      time_increment: query.timeIncrement === 1 || query.timeIncrement === "hourly" ? 1 : undefined,
      filtering: query.entityIds ? JSON.stringify(this.entityFilters(query.level, query.entityIds)) : undefined,
      ...cursorPaging(query)
    });
    return toMetaPage((page.data ?? []).map((row) => insightRowToMeta(row, query, account)), page.paging);
  }

  async getBreakdowns(query: MetaBreakdownQuery): Promise<MetaPage<MetaBreakdownRow>> {
    const rawKey = query.breakdowns.join(",");
    const sortedKey = [...query.breakdowns].sort().join(",");
    let validation = validateBreakdownRequest(rawKey, query.level);
    if (!validation.supported) {
      const sortedValidation = validateBreakdownRequest(sortedKey, query.level);
      if (sortedValidation.supported) validation = sortedValidation;
    }
    // Order-insensitive fallback for known multi-dimension combos (e.g. platform_position,publisher_platform).
    if (!validation.supported) {
      const match = breakdownCapabilities.find((capability) => {
        if (!capability.supportedLevels.includes(query.level)) return false;
        const a = [...capability.dimensions].sort().join(",");
        return a === sortedKey;
      });
      if (match) validation = { supported: true, capability: match };
    }
    if (!validation.supported) {
      throw new MetaApiError(validation.reason ?? "Requested breakdown combination is unsupported.", "unsupported_breakdown", "unsupported_breakdown", false, {
        breakdowns: query.breakdowns,
        level: query.level
      });
    }
    const insightPage = await this.client.getPage<GraphInsightRow>(`/${query.accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      level: query.level,
      breakdowns: query.breakdowns.join(","),
      ...(query.datePreset ? { date_preset: query.datePreset } : { time_range: JSON.stringify({ since: query.dateRange.since, until: query.dateRange.until }) }),
      time_increment: query.timeIncrement === 1 || query.timeIncrement === "hourly" ? 1 : undefined,
      filtering: query.entityIds ? JSON.stringify(this.entityFilters(query.level, query.entityIds)) : undefined,
      ...cursorPaging(query)
    });
    const account = this.accountCache.get(query.accountId) ?? (await this.lookupAccount(query.accountId));
    const isHourlyBreakdown = query.breakdowns.some((item) => item.startsWith("hourly_stats"));
    return toMetaPage(
      (insightPage.data ?? []).map((row) => {
        const base = insightRowToMeta({ ...row, ...(isHourlyBreakdown ? {} : {}) }, { ...query, timeIncrement: isHourlyBreakdown ? "hourly" : query.timeIncrement }, account);
        if (isHourlyBreakdown) {
          base.reach = null;
          base.frequency = null;
          base.availability = { ...base.availability, reach: "unsupported", frequency: "unsupported" };
        }
        return {
          ...base,
          breakdownKey: query.breakdowns.join(","),
          breakdownValues: Object.fromEntries(query.breakdowns.map((breakdown) => [breakdown, String(row[breakdown] ?? "unknown")]))
        };
      }),
      insightPage.paging
    );
  }

  private entityFilters(level: MetaEntityLevel, entityIds: string[]) {
    if (level === "account") return [];
    const field = level === "campaign" ? "campaign.id" : level === "adset" ? "adset.id" : "ad.id";
    return [{ field, operator: "IN", value: entityIds }];
  }

  private async lookupAccount(accountId: string) {
    const raw = await this.client.getObject<GraphAdAccount>(`/${accountId}`, { fields: ACCOUNT_FIELDS });
    const account: MetaAdAccount = {
      id: accountId,
      accountId: raw.account_id ?? accountId.replace(/^act_/, ""),
      name: raw.name ?? accountId,
      currency: raw.currency ?? "USD",
      timezone: raw.timezone_name ?? "UTC",
      accessStatus: accountStatus(raw.account_status)
    };
    this.accountCache.set(account.id, account);
    return account;
  }
}

export function createGraphApiMetaAdsProvider(options: GraphApiMetaAdsProviderOptions) {
  return new GraphApiMetaAdsProvider(options);
}
