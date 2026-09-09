import { aggregateSourceMetrics } from "@/server/analytics/metrics/aggregate";
import { compareMetric, detectAnomalies, evaluateDataSufficiency, rankEntities, type AnalyticsMetricSet, type MetricComparison } from "@/server/analytics";
import { createMockMetaAdsProvider, type MetaAd, type MetaAdAccount, type MetaAdSet, type MetaCampaign, type MetaEntityLevel, type MetaInsightRow } from "@/server/meta";
import { previousEquivalentPeriod, resolveDatePreset, type DateRangePreset, type ReportingDateRange } from "@/lib/dates/reporting";

export type ComparisonMetricKey = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpa" | "conversions" | "conversionValue" | "roas";

export type TrendQuery = {
  accountId?: string;
  preset?: DateRangePreset;
  entityLevel?: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">;
  metricKey?: ComparisonMetricKey;
};

export type ComparedEntity = {
  id: string;
  name: string;
  level: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">;
  parentName?: string;
  status: string;
  reportHref: string;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  comparison: MetricComparison;
  sufficiency: ReturnType<typeof evaluateDataSufficiency>;
};

export type TrendDashboardData = {
  accounts: MetaAdAccount[];
  selectedAccount: MetaAdAccount;
  range: ReportingDateRange;
  previousRange: ReportingDateRange;
  entityLevel: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">;
  metricKey: ComparisonMetricKey;
  entities: ComparedEntity[];
  topEntities: Array<ComparedEntity & { rank: number }>;
  bottomEntities: Array<ComparedEntity & { rank: number }>;
  topMovers: ComparedEntity[];
  accountMetrics: AnalyticsMetricSet;
  previousAccountMetrics: AnalyticsMetricSet;
  accountComparisons: Record<ComparisonMetricKey, MetricComparison>;
  accountAnomalies: ReturnType<typeof detectAnomalies>;
  dailyTrend: Array<{ date: string; spend: number; impressions: number; clicks: number; conversions: number; roas: number | null }>;
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

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const groupKey = key(item);
    groups[groupKey] = [...(groups[groupKey] ?? []), item];
    return groups;
  }, {});
}

function rowToInput(row: MetaInsightRow) {
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

function aggregateRows(rows: MetaInsightRow[]) {
  return aggregateSourceMetrics(rows.map(rowToInput));
}

function normalizeLevel(value: TrendQuery["entityLevel"]): Extract<MetaEntityLevel, "campaign" | "adset" | "ad"> {
  return value ?? "campaign";
}

function normalizeMetric(value: TrendQuery["metricKey"]): ComparisonMetricKey {
  return value ?? "roas";
}

function normalizePreset(value: TrendQuery["preset"]): DateRangePreset {
  return value ?? "last_7_days";
}

function hrefFor(level: ComparedEntity["level"], id: string) {
  if (level === "campaign") return `/campaigns/${id}`;
  if (level === "adset") return `/adsets/${id}`;
  return `/ads/${id}`;
}

async function listEntities(accountId: string, level: ComparedEntity["level"]) {
  const provider = createMockMetaAdsProvider();
  const campaigns = await fetchAllPages<MetaCampaign>((after) => provider.listCampaigns(accountId, { limit: 100, after }));

  if (level === "campaign") {
    return campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      parentName: undefined,
      status: campaign.effectiveStatus
    }));
  }

  const adSets = await fetchAllPages<MetaAdSet>((after) => provider.listAdSets(accountId, undefined, { limit: 100, after }));
  if (level === "adset") {
    return adSets.map((adSet) => ({
      id: adSet.id,
      name: adSet.name,
      parentName: campaigns.find((campaign) => campaign.id === adSet.campaignId)?.name,
      status: adSet.effectiveStatus
    }));
  }

  const ads = await fetchAllPages<MetaAd>((after) => provider.listAds(accountId, undefined, { limit: 100, after }));
  return ads.map((ad) => ({
    id: ad.id,
    name: ad.name,
    parentName: adSets.find((adSet) => adSet.id === ad.adSetId)?.name,
    status: ad.effectiveStatus
  }));
}

async function insightsFor(accountId: string, level: MetaEntityLevel, range: ReportingDateRange, entityIds?: string[]) {
  const provider = createMockMetaAdsProvider();
  return fetchAllPages<MetaInsightRow>((after) =>
    provider.getInsights({ accountId, level, entityIds, dateRange: range, limit: 100, after })
  );
}

function buildDailyTrend(rows: MetaInsightRow[]) {
  return Object.entries(groupBy(rows, (row) => row.dateStart))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateRows]) => {
      const metrics = aggregateRows(dateRows);
      return {
        date,
        spend: metrics.spend.value ?? 0,
        impressions: metrics.impressions.value ?? 0,
        clicks: metrics.clicks.value ?? 0,
        conversions: metrics.conversions.value ?? 0,
        roas: metrics.roas.value
      };
    });
}

function comparisonDirection(metricKey: ComparisonMetricKey) {
  return metricKey === "cpc" || metricKey === "cpa" ? "lower_is_better" : "higher_is_better";
}

export async function getTrendDashboardData(query: TrendQuery = {}): Promise<TrendDashboardData> {
  const provider = createMockMetaAdsProvider();
  const accounts = await fetchAllPages<MetaAdAccount>((after) => provider.listAdAccounts({ limit: 100, after }));
  const selectedAccount = accounts.find((account) => account.id === query.accountId) ?? accounts[0];

  if (!selectedAccount) throw new Error("No mock accounts available for trends");

  const entityLevel = normalizeLevel(query.entityLevel);
  const metricKey = normalizeMetric(query.metricKey);
  const range = resolveDatePreset(normalizePreset(query.preset), selectedAccount.timezone, new Date("2026-09-10T12:00:00.000Z"));
  const previousRange = previousEquivalentPeriod(range);
  const entityDefinitions = await listEntities(selectedAccount.id, entityLevel);

  const [currentRows, previousRows, accountRows, previousAccountRows] = await Promise.all([
    insightsFor(selectedAccount.id, entityLevel, range),
    insightsFor(selectedAccount.id, entityLevel, previousRange),
    insightsFor(selectedAccount.id, "account", range),
    insightsFor(selectedAccount.id, "account", previousRange)
  ]);

  const currentByEntity = groupBy(currentRows, (row) => row.entityId);
  const previousByEntity = groupBy(previousRows, (row) => row.entityId);

  const entities: ComparedEntity[] = entityDefinitions.map((entity) => {
    const metrics = aggregateRows(currentByEntity[entity.id] ?? []);
    const previousMetrics = aggregateRows(previousByEntity[entity.id] ?? []);
    return {
      id: entity.id,
      name: entity.name,
      level: entityLevel,
      parentName: entity.parentName,
      status: entity.status,
      reportHref: hrefFor(entityLevel, entity.id),
      metrics,
      previousMetrics,
      comparison: compareMetric(metrics[metricKey], previousMetrics[metricKey]),
      sufficiency: evaluateDataSufficiency(metrics)
    };
  });

  const topEntities = rankEntities(entities, metricKey, comparisonDirection(metricKey)).slice(0, 6);
  const bottomEntities = rankEntities(entities, metricKey, comparisonDirection(metricKey) === "higher_is_better" ? "lower_is_better" : "higher_is_better").slice(0, 6);
  const topMovers = [...entities]
    .filter((entity) => entity.comparison.percentageChange.value !== null)
    .sort((a, b) => Math.abs(b.comparison.percentageChange.value ?? 0) - Math.abs(a.comparison.percentageChange.value ?? 0))
    .slice(0, 6);
  const accountMetrics = aggregateRows(accountRows);
  const previousAccountMetrics = aggregateRows(previousAccountRows);

  return {
    accounts,
    selectedAccount,
    range,
    previousRange,
    entityLevel,
    metricKey,
    entities,
    topEntities,
    bottomEntities,
    topMovers,
    accountMetrics,
    previousAccountMetrics,
    accountComparisons: {
      spend: compareMetric(accountMetrics.spend, previousAccountMetrics.spend),
      impressions: compareMetric(accountMetrics.impressions, previousAccountMetrics.impressions),
      clicks: compareMetric(accountMetrics.clicks, previousAccountMetrics.clicks),
      ctr: compareMetric(accountMetrics.ctr, previousAccountMetrics.ctr),
      cpc: compareMetric(accountMetrics.cpc, previousAccountMetrics.cpc),
      cpa: compareMetric(accountMetrics.cpa, previousAccountMetrics.cpa),
      conversions: compareMetric(accountMetrics.conversions, previousAccountMetrics.conversions),
      conversionValue: compareMetric(accountMetrics.conversionValue, previousAccountMetrics.conversionValue),
      roas: compareMetric(accountMetrics.roas, previousAccountMetrics.roas)
    },
    accountAnomalies: detectAnomalies(accountMetrics, previousAccountMetrics),
    dailyTrend: buildDailyTrend(accountRows),
    caveats: [
      "Trends and comparisons use deterministic mock Meta data until live read-only Meta ingestion is implemented.",
      "Percentage change is unavailable when the comparison period value is zero or unavailable.",
      "Rankings exclude entities where the selected metric is unavailable instead of treating unavailable as zero.",
      `Date boundaries use the selected account timezone: ${selectedAccount.timezone}. Currency: ${selectedAccount.currency}.`
    ]
  };
}
