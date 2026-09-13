import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { getDatabase } from "@/server/db/client";
import { adAccounts, ads, adSets, campaigns, clients } from "@/server/db/schema";
import { MetricsRepository } from "@/server/repositories/metrics-repository";
import type { InsightMetricInput, MetricState } from "@/server/analytics/metrics/types";
import type {
  MetaAd,
  MetaAdAccount,
  MetaAdSet,
  MetaBreakdownRow,
  MetaCampaign,
  MetaDateRange,
  MetaEntityLevel,
  MetaInsightRow
} from "@/server/meta/types";

function shouldUsePersisted(): boolean {
  if (process.env.ANALYTICS_SOURCE === "mock") return false;
  return true;
}

export function getAnalyticsDb(getDb: () => Database = getDatabase): Database | null {
  if (!shouldUsePersisted()) return null;
  try {
    return getDb();
  } catch {
    return null;
  }
}

export type PersistedAccountContext = {
  dbRowId: string;
  clientId: string;
  clientName: string;
  account: MetaAdAccount;
  lastSyncAt: string | null;
  lastSyncState: string | null;
};

function toContext(
  row: typeof adAccounts.$inferSelect,
  clientName: string
): PersistedAccountContext {
  return {
    dbRowId: row.id,
    clientId: row.clientId,
    clientName,
    account: {
      id: `act_${row.metaAccountId}`,
      accountId: row.metaAccountId,
      name: row.name,
      currency: row.currency,
      timezone: row.timezone,
      accessStatus: row.accessStatus
    },
    lastSyncAt: row.lastSuccessfulSyncAt ? row.lastSuccessfulSyncAt.toISOString() : null,
    lastSyncState: row.lastSyncState
  };
}

export async function listPersistedAccounts(db: Database): Promise<PersistedAccountContext[] | null> {
  const rows = await db.query.adAccounts.findMany({ where: isNull(adAccounts.archivedAt), limit: 200 });
  if (rows.length === 0) return null;
  const clientRows = await db.query.clients.findMany({ limit: 500 });
  const clientById = new Map(clientRows.map((client) => [client.id, client]));
  return rows.map((row) => toContext(row, clientById.get(row.clientId)?.name ?? "Default Client"));
}

export async function findPersistedAccount(db: Database, metaAccountId: string): Promise<PersistedAccountContext | null> {
  const normalized = metaAccountId.replace(/^act_/, "");
  const row =
    (await db.query.adAccounts.findFirst({ where: and(eq(adAccounts.metaAccountId, normalized), isNull(adAccounts.archivedAt)) })) ??
    (await db.query.adAccounts.findFirst({ where: and(eq(adAccounts.metaAccountId, metaAccountId), isNull(adAccounts.archivedAt)) }));
  if (!row) return null;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, row.clientId) });
  return toContext(row, client?.name ?? "Default Client");
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function availabilityFromSource(sourceFields: unknown, fallback: MetricState | null): Partial<Record<string, MetricState>> {
  const stored = (sourceFields as { availability?: Record<string, MetricState> } | null)?.availability;
  if (stored && typeof stored === "object") return stored;
  return {
    spend: fallback ?? "unavailable",
    impressions: fallback ?? "unavailable",
    reach: fallback ?? "unavailable",
    clicks: fallback ?? "unavailable",
    linkClicks: fallback ?? "unavailable",
    outboundClicks: fallback ?? "unavailable",
    conversions: fallback ?? "unavailable",
    conversionValue: fallback ?? "unavailable"
  };
}

export function persistedRowToInput(row: {
  spend: string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  outboundClicks: number | null;
  conversions: string | null;
  conversionValue: string | null;
  availabilityState: MetricState;
  sourceFields: unknown;
}): InsightMetricInput {
  return {
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.clicks),
    linkClicks: toNumber(row.linkClicks),
    outboundClicks: toNumber(row.outboundClicks),
    conversions: toNumber(row.conversions),
    conversionValue: toNumber(row.conversionValue),
    availability: availabilityFromSource(row.sourceFields, row.availabilityState)
  };
}

export type PersistedInsightQuery = {
  accountDbId: string;
  account: MetaAdAccount;
  level: MetaEntityLevel;
  entityKeys?: string[];
  range: MetaDateRange;
  limit?: number;
};

export async function fetchPersistedInsightRows(db: Database, query: PersistedInsightQuery): Promise<MetaInsightRow[] | null> {
  const metrics = new MetricsRepository({ db, agencyId: "" });
  const rows = await metrics.dailyByEntities({
    adAccountId: query.accountDbId,
    entityLevel: query.level,
    entityKeys: query.entityKeys,
    dateStart: query.range.since,
    dateStop: query.range.until,
    limit: query.limit ?? 5000
  });
  if (rows.length === 0) return null;
  return rows.map((row) => {
    const input = persistedRowToInput(row);
    return {
      accountId: query.account.id,
      level: query.level,
      entityId: row.entityKey,
      entityName: ((row.sourceFields as { entityName?: string } | null)?.entityName ?? row.entityKey) as string,
      dateStart: row.date,
      dateStop: row.date,
      timezone: row.timezone,
      currency: row.currency,
      attributionContext: (row.attributionContext ?? {}) as Record<string, unknown>,
      spend: input.spend ?? null,
      impressions: input.impressions ?? null,
      reach: input.reach ?? null,
      clicks: input.clicks ?? null,
      linkClicks: input.linkClicks ?? null,
      outboundClicks: input.outboundClicks ?? null,
      ctr: null,
      cpc: null,
      cpm: null,
      frequency: null,
      conversions: input.conversions ?? null,
      conversionValue: input.conversionValue ?? null,
      videoMetrics: (row.videoMetrics ?? {}) as Record<string, number | null>,
      engagementMetrics: (row.engagementMetrics ?? {}) as Record<string, number | null>,
      actionMetrics: (row.actionMetrics ?? {}) as Record<string, number | null>,
      availability: (input.availability ?? {}) as MetaInsightRow["availability"]
    };
  });
}

export type PersistedBreakdownQuery = PersistedInsightQuery & { breakdowns: string[] };

export async function fetchPersistedBreakdownRows(db: Database, query: PersistedBreakdownQuery): Promise<MetaBreakdownRow[] | null> {
  const metrics = new MetricsRepository({ db, agencyId: "" });
  const breakdownKey = query.breakdowns.join(",");
  const rows = await metrics.breakdownDaily({
    adAccountId: query.accountDbId,
    breakdownKey,
    entityKeys: query.entityKeys,
    dateStart: query.range.since,
    dateStop: query.range.until,
    limit: query.limit ?? 5000
  });
  if (rows.length === 0) return null;
  return rows.map((row) => {
    const input = persistedRowToInput(row);
    return {
      accountId: query.account.id,
      level: query.level,
      entityId: row.entityKey,
      entityName: ((row.sourceFields as { entityName?: string } | null)?.entityName ?? row.entityKey) as string,
      dateStart: row.date,
      dateStop: row.date,
      timezone: row.timezone,
      currency: row.currency,
      attributionContext: (row.attributionContext ?? {}) as Record<string, unknown>,
      spend: input.spend ?? null,
      impressions: input.impressions ?? null,
      reach: input.reach ?? null,
      clicks: input.clicks ?? null,
      linkClicks: input.linkClicks ?? null,
      outboundClicks: input.outboundClicks ?? null,
      ctr: null,
      cpc: null,
      cpm: null,
      frequency: null,
      conversions: input.conversions ?? null,
      conversionValue: input.conversionValue ?? null,
      videoMetrics: (row.videoMetrics ?? {}) as Record<string, number | null>,
      engagementMetrics: (row.engagementMetrics ?? {}) as Record<string, number | null>,
      actionMetrics: (row.actionMetrics ?? {}) as Record<string, number | null>,
      availability: (input.availability ?? {}) as MetaInsightRow["availability"],
      breakdownKey: row.breakdownKey,
      breakdownValues: row.breakdownValues
    };
  });
}

export type PersistedHierarchy = {
  campaigns: MetaCampaign[];
  adSets: MetaAdSet[];
  ads: MetaAd[];
};

export async function fetchPersistedHierarchy(db: Database, account: MetaAdAccount, accountDbId: string): Promise<PersistedHierarchy | null> {
  const campaignRows = await db.query.campaigns.findMany({ where: and(eq(campaigns.adAccountId, accountDbId), isNull(campaigns.archivedAt)), limit: 2000 });
  if (campaignRows.length === 0) return null;
  const adSetRows = await db.query.adSets.findMany({ where: and(eq(adSets.adAccountId, accountDbId), isNull(adSets.archivedAt)), limit: 5000 });
  const adRows = await db.query.ads.findMany({ where: and(eq(ads.adAccountId, accountDbId), isNull(ads.archivedAt)), limit: 5000 });
  const campaignIdByDbId = new Map(campaignRows.map((row) => [row.id, row.metaCampaignId]));
  const adSetIdByDbId = new Map(adSetRows.map((row) => [row.id, row.metaAdsetId]));
  return {
    campaigns: campaignRows.map((row) => ({
      id: row.metaCampaignId,
      accountId: account.id,
      name: row.name,
      status: row.effectiveStatus ?? "UNKNOWN",
      effectiveStatus: row.effectiveStatus ?? "UNKNOWN",
      objective: row.objective ?? "UNKNOWN",
      buyingType: row.buyingType ?? "UNKNOWN"
    })),
    adSets: adSetRows.map((row) => ({
      id: row.metaAdsetId,
      accountId: account.id,
      campaignId: campaignIdByDbId.get(row.campaignId) ?? "unknown_campaign",
      name: row.name,
      status: row.effectiveStatus ?? "UNKNOWN",
      effectiveStatus: row.effectiveStatus ?? "UNKNOWN",
      optimizationGoal: row.optimizationGoal ?? "UNKNOWN",
      billingEvent: row.billingEvent ?? "UNKNOWN",
      attributionSpec: (row.attributionSpec ?? {}) as Record<string, unknown>
    })),
    ads: adRows.map((row) => ({
      id: row.metaAdId,
      accountId: account.id,
      campaignId: campaignIdByDbId.get(row.campaignId) ?? "unknown_campaign",
      adSetId: adSetIdByDbId.get(row.adSetId) ?? "unknown_adset",
      creativeId: row.creativeId ?? "unknown_creative",
      name: row.name,
      status: row.effectiveStatus ?? "UNKNOWN",
      effectiveStatus: row.effectiveStatus ?? "UNKNOWN"
    }))
  };
}
