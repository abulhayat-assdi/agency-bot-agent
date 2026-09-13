import { and, eq } from "drizzle-orm";

import { aggregateSourceMetrics } from "@/server/analytics/metrics/aggregate";
import { detectAnomalies, evaluateDataSufficiency, type AnalyticsMetricSet } from "@/server/analytics";
import {
  fetchPersistedBreakdownRows,
  fetchPersistedHierarchy,
  fetchPersistedInsightRows,
  findPersistedAccount,
  getAnalyticsDb,
  listPersistedAccounts
} from "@/server/analytics/persisted/store";
import { createMockMetaAdsProvider, type MetaAd, type MetaAdAccount, type MetaAdSet, type MetaBreakdownRow, type MetaCampaign, type MetaCreative, type MetaInsightRow } from "@/server/meta";
import { ads, creativeMetadata } from "@/server/db/schema";
import { dashboardClients, type DashboardClient } from "@/server/dashboard/mock-dashboard-data";
import { previousEquivalentPeriod, resolveDatePreset, type DateRangePreset, type ReportingDateRange } from "@/lib/dates/reporting";

export type EntityContext = {
  client: DashboardClient;
  account: MetaAdAccount;
  campaign?: MetaCampaign;
  adSet?: MetaAdSet;
  ad?: MetaAd;
  creative?: MetaCreative | null;
};

export type ChildPerformance = {
  id: string;
  name: string;
  status: string;
  secondary?: string;
  metrics: AnalyticsMetricSet;
};

export type BreakdownPreview = {
  key: string;
  label: string;
  rows: Array<{
    label: string;
    metrics: AnalyticsMetricSet;
  }>;
  limitation?: string;
};

export type ReportData = {
  range: ReportingDateRange;
  previousRange: ReportingDateRange;
  context: EntityContext;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  sufficiency: ReturnType<typeof evaluateDataSufficiency>;
  anomalies: ReturnType<typeof detectAnomalies>;
  trend: Array<{ date: string; spend: number; impressions: number; clicks: number; conversions: number }>;
  children: ChildPerformance[];
  breakdowns: BreakdownPreview[];
  source: "persisted" | "mock";
  caveats: string[];
};

async function fetchAllPages<T>(fetchPage: (after?: string) => Promise<{ data: T[]; paging: { cursors: { after?: string } } }>) {
  const rows: T[] = [];
  let after: string | undefined;
  do {
    const page = await fetchPage(after);
    rows.push(...page.data);
    after = page.paging.cursors.after;
  } while (after);
  return rows;
}

function clientForAccount(accountId: string) {
  return dashboardClients.find((client) => client.accountIds.includes(accountId)) ?? dashboardClients[0];
}

function rowToInput(row: MetaInsightRow | MetaBreakdownRow) {
  return {
    spend: row.spend,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    outboundClicks: row.outboundClicks,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
    availability: row.availability
  };
}

function aggregateRows(rows: Array<MetaInsightRow | MetaBreakdownRow>) {
  return aggregateSourceMetrics(rows.map(rowToInput));
}

function trendFromRows(rows: MetaInsightRow[]) {
  return rows
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
    .map((row) => ({
      date: row.dateStart,
      spend: row.spend ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      conversions: row.conversions ?? 0
    }));
}

async function getBaseContext() {
  const persisted = await loadPersistedHierarchy();
  if (persisted) return { ...persisted, provider: createMockMetaAdsProvider() };
  const provider = createMockMetaAdsProvider();
  const accounts = await fetchAllPages<MetaAdAccount>((after) => provider.listAdAccounts({ limit: 100, after }));
  const campaigns = (await Promise.all(accounts.map((account) => fetchAllPages<MetaCampaign>((after) => provider.listCampaigns(account.id, { limit: 100, after }))))).flat();
  const adSets = (await Promise.all(accounts.map((account) => fetchAllPages<MetaAdSet>((after) => provider.listAdSets(account.id, undefined, { limit: 100, after }))))).flat();
  const ads = (await Promise.all(accounts.map((account) => fetchAllPages<MetaAd>((after) => provider.listAds(account.id, undefined, { limit: 100, after }))))).flat();
  return { provider, accounts, campaigns, adSets, ads, clients: dashboardClients, syncedAccountIds: new Set<string>() };
}

async function loadPersistedHierarchy(): Promise<{
  accounts: MetaAdAccount[];
  campaigns: MetaCampaign[];
  adSets: MetaAdSet[];
  ads: MetaAd[];
  clients: DashboardClient[];
  syncedAccountIds: Set<string>;
} | null> {
  const db = getAnalyticsDb();
  if (!db) return null;
  try {
    const contexts = await listPersistedAccounts(db);
    if (!contexts) return null;
    const accounts: MetaAdAccount[] = [];
    const campaigns: MetaCampaign[] = [];
    const adSets: MetaAdSet[] = [];
    const ads: MetaAd[] = [];
    const clients: DashboardClient[] = [];
    const syncedAccountIds = new Set<string>();
    for (const context of contexts) {
      const hierarchy = await fetchPersistedHierarchy(db, context.account, context.dbRowId);
      if (!hierarchy) continue;
      accounts.push(context.account);
      campaigns.push(...hierarchy.campaigns);
      adSets.push(...hierarchy.adSets);
      ads.push(...hierarchy.ads);
      clients.push({ id: context.clientId, name: context.clientName, status: "active", accountIds: [context.account.id] });
      if (context.lastSyncAt) syncedAccountIds.add(context.account.id);
    }
    if (accounts.length === 0) return null;
    return { accounts, campaigns, adSets, ads, clients, syncedAccountIds };
  } catch {
    return null;
  }
}

function clientForPersisted(accountId: string, clients: DashboardClient[]) {
  return clients.find((client) => client.accountIds.includes(accountId)) ?? clientForAccount(accountId);
}

async function getPersistedRows(accountId: string, level: "campaign" | "adset" | "ad", entityId: string, range: ReportingDateRange): Promise<MetaInsightRow[] | null> {
  const db = getAnalyticsDb();
  if (!db) return null;
  try {
    const context = await findPersistedAccount(db, accountId);
    if (!context) return null;
    return await fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level, entityKeys: [entityId], range });
  } catch {
    return null;
  }
}

async function getInsights(accountId: string, level: "campaign" | "adset" | "ad", entityId: string, range: ReportingDateRange, persistedOnly = false) {
  const persisted = await getPersistedRows(accountId, level, entityId, range);
  if (persisted) return { rows: persisted, source: "persisted" as const };
  if (persistedOnly) return { rows: [], source: "persisted" as const };
  const provider = createMockMetaAdsProvider();
  const rows = await fetchAllPages<MetaInsightRow>((after) =>
    provider.getInsights({ accountId, level, entityIds: [entityId], dateRange: range, limit: 100, after })
  );
  return { rows, source: "mock" as const };
}

async function getPersistedBreakdownPreview(accountId: string, level: "campaign" | "adset" | "ad", entityId: string, range: ReportingDateRange, breakdowns: string[]): Promise<MetaBreakdownRow[] | null> {
  const db = getAnalyticsDb();
  if (!db) return null;
  try {
    const context = await findPersistedAccount(db, accountId);
    if (!context) return null;
    return await fetchPersistedBreakdownRows(db, { accountDbId: context.dbRowId, account: context.account, level, breakdowns, range, entityKeys: [entityId] });
  } catch {
    return null;
  }
}

async function breakdownPreview(
  accountId: string,
  level: "campaign" | "adset" | "ad",
  entityId: string,
  range: ReportingDateRange,
  persistedOnly = false
): Promise<{ previews: BreakdownPreview[]; source: "persisted" | "mock" }> {
  const provider = createMockMetaAdsProvider();
  const definitions = [
    { key: "age,gender", label: "Demographics", breakdowns: ["age", "gender"] },
    { key: "country", label: "Geography", breakdowns: ["country"] },
    { key: "publisher_platform,platform_position", label: "Platform / placement", breakdowns: ["publisher_platform", "platform_position"] },
    { key: "device_platform", label: "Device", breakdowns: ["device_platform"] },
    { key: "hourly_stats_aggregated_by_advertiser_time_zone", label: "Hourly", breakdowns: ["hourly_stats_aggregated_by_advertiser_time_zone"] }
  ];

  const previews: BreakdownPreview[] = [];
  let source: "persisted" | "mock" = persistedOnly ? "persisted" : "mock";

  for (const definition of definitions) {
    const persisted = await getPersistedBreakdownPreview(accountId, level, entityId, range, definition.breakdowns);
    let rows: MetaBreakdownRow[];
    if (persisted) {
      rows = persisted;
      source = "persisted";
    } else if (persistedOnly) {
      rows = [];
    } else {
      rows = await fetchAllPages<MetaBreakdownRow>((after) =>
        provider.getBreakdowns({ accountId, level, entityIds: [entityId], dateRange: range, breakdowns: definition.breakdowns, limit: 100, after })
      );
    }
    const groups = groupBy(rows, (row) => JSON.stringify(row.breakdownValues));
    previews.push({
      key: definition.key,
      label: definition.label,
      rows: Object.entries(groups).map(([valuesJson, groupRows]) => ({
        label: Object.values(JSON.parse(valuesJson) as Record<string, string>).join(" / "),
        metrics: aggregateRows(groupRows)
      })),
      limitation: definition.key.startsWith("hourly") ? "Reach and frequency are unsupported for hourly breakdowns and remain unavailable." : undefined
    });
  }

  return { previews, source };
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const groupKey = key(item);
    groups[groupKey] = [...(groups[groupKey] ?? []), item];
    return groups;
  }, {});
}

function baseReport(
  rows: MetaInsightRow[],
  previousRows: MetaInsightRow[],
  range: ReportingDateRange,
  previousRange: ReportingDateRange,
  context: EntityContext,
  children: ChildPerformance[],
  breakdowns: BreakdownPreview[],
  source: "persisted" | "mock"
): ReportData {
  const metrics = aggregateRows(rows);
  const previousMetrics = aggregateRows(previousRows);

  return {
    range,
    previousRange,
    context,
    metrics,
    previousMetrics,
    sufficiency: evaluateDataSufficiency(metrics),
    anomalies: detectAnomalies(metrics, previousMetrics),
    trend: trendFromRows(rows),
    children,
    breakdowns,
    source,
    caveats: [
      source === "persisted"
        ? "This report reads persisted PostgreSQL data; the database is the source of truth."
        : "No persisted data exists for this account, so this report uses deterministic mock Meta data.",
      "All derived metrics are calculated by the analytics engine, not by AI or UI code.",
      "Unavailable, unsupported, partial, and null metrics are shown explicitly and are not converted to zero.",
      `Reporting dates use the ad account timezone: ${context.account.timezone}.`
    ]
  };
}

async function getCreativeForAd(accountId: string, ad: MetaAd, provider: ReturnType<typeof createMockMetaAdsProvider>): Promise<MetaCreative | null> {
  const persisted = await getPersistedCreative(accountId, ad.id);
  if (persisted !== undefined) return persisted;
  try {
    return await provider.getCreative(ad.id);
  } catch {
    return null;
  }
}

async function getPersistedCreative(accountId: string, metaAdId: string): Promise<MetaCreative | null | undefined> {
  const db = getAnalyticsDb();
  if (!db) return undefined;
  try {
    const context = await findPersistedAccount(db, accountId);
    if (!context) return undefined;
    const adRow = await db.query.ads.findFirst({
      where: and(eq(ads.adAccountId, context.dbRowId), eq(ads.metaAdId, metaAdId))
    });
    if (!adRow) return undefined;
    const creativeRow = (await db.query.creativeMetadata.findMany({ where: eq(creativeMetadata.adId, adRow.id), limit: 1 }))[0];
    if (!creativeRow) return null;
    return {
      id: creativeRow.metaCreativeId,
      adId: metaAdId,
      name: creativeRow.name ?? creativeRow.metaCreativeId,
      pageId: creativeRow.pageId ?? undefined,
      instagramActorId: creativeRow.instagramActorId ?? undefined,
      thumbnailUrl: creativeRow.thumbnailUrl ?? undefined,
      objectType: (creativeRow.objectType as MetaCreative["objectType"]) ?? "image",
      metadata: (creativeRow.metadata ?? {}) as Record<string, unknown>
    };
  } catch {
    return undefined;
  }
}

export async function getCampaignReport(campaignId: string, preset: DateRangePreset = "last_7_days") {
  const { provider, accounts, campaigns, adSets, clients, syncedAccountIds } = await getBaseContext();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) return null;
  const account = accounts.find((item) => item.id === campaign.accountId);
  if (!account) return null;
  const persistedOnly = syncedAccountIds.has(account.id);
  const range = resolveDatePreset(preset, account.timezone, persistedOnly ? new Date() : new Date("2026-09-10T12:00:00.000Z"));
  const previousRange = previousEquivalentPeriod(range);
  const rows = await getInsights(account.id, "campaign", campaign.id, range, persistedOnly);
  const previousRows = await getInsights(account.id, "campaign", campaign.id, previousRange, persistedOnly);
  const childAdSets = adSets.filter((adSet) => adSet.campaignId === campaign.id);
  const children = await Promise.all(
    childAdSets.map(async (adSet) => ({
      id: adSet.id,
      name: adSet.name,
      status: adSet.effectiveStatus,
      secondary: adSet.optimizationGoal,
      metrics: aggregateRows((await getInsights(account.id, "adset", adSet.id, range, persistedOnly)).rows)
    }))
  );
  const breakdowns = await breakdownPreview(account.id, "campaign", campaign.id, range, persistedOnly);
  void provider;
  return baseReport(rows.rows, previousRows.rows, range, previousRange, { client: clientForPersisted(account.id, clients), account, campaign }, children, breakdowns.previews, rows.source);
}

export async function getAdSetReport(adSetId: string, preset: DateRangePreset = "last_7_days") {
  const { accounts, campaigns, adSets, ads, clients, syncedAccountIds } = await getBaseContext();
  const adSet = adSets.find((item) => item.id === adSetId);
  if (!adSet) return null;
  const account = accounts.find((item) => item.id === adSet.accountId);
  const campaign = campaigns.find((item) => item.id === adSet.campaignId);
  if (!account || !campaign) return null;
  const persistedOnly = syncedAccountIds.has(account.id);
  const range = resolveDatePreset(preset, account.timezone, persistedOnly ? new Date() : new Date("2026-09-10T12:00:00.000Z"));
  const previousRange = previousEquivalentPeriod(range);
  const rows = await getInsights(account.id, "adset", adSet.id, range, persistedOnly);
  const previousRows = await getInsights(account.id, "adset", adSet.id, previousRange, persistedOnly);
  const childAds = ads.filter((ad) => ad.adSetId === adSet.id);
  const children = await Promise.all(
    childAds.map(async (ad) => ({
      id: ad.id,
      name: ad.name,
      status: ad.effectiveStatus,
      secondary: ad.creativeId,
      metrics: aggregateRows((await getInsights(account.id, "ad", ad.id, range, persistedOnly)).rows)
    }))
  );
  const breakdowns = await breakdownPreview(account.id, "adset", adSet.id, range, persistedOnly);
  return baseReport(rows.rows, previousRows.rows, range, previousRange, { client: clientForPersisted(account.id, clients), account, campaign, adSet }, children, breakdowns.previews, rows.source);
}

export async function getAdReport(adId: string, preset: DateRangePreset = "last_7_days") {
  const { provider, accounts, campaigns, adSets, ads, clients, syncedAccountIds } = await getBaseContext();
  const ad = ads.find((item) => item.id === adId);
  if (!ad) return null;
  const account = accounts.find((item) => item.id === ad.accountId);
  const campaign = campaigns.find((item) => item.id === ad.campaignId);
  const adSet = adSets.find((item) => item.id === ad.adSetId);
  if (!account || !campaign || !adSet) return null;
  const persistedOnly = syncedAccountIds.has(account.id);
  const creative = await getCreativeForAd(account.id, ad, provider);
  const range = resolveDatePreset(preset, account.timezone, persistedOnly ? new Date() : new Date("2026-09-10T12:00:00.000Z"));
  const previousRange = previousEquivalentPeriod(range);
  const rows = await getInsights(account.id, "ad", ad.id, range, persistedOnly);
  const previousRows = await getInsights(account.id, "ad", ad.id, previousRange, persistedOnly);
  const breakdowns = await breakdownPreview(account.id, "ad", ad.id, range, persistedOnly);
  return baseReport(rows.rows, previousRows.rows, range, previousRange, { client: clientForPersisted(account.id, clients), account, campaign, adSet, ad, creative }, [], breakdowns.previews, rows.source);
}
