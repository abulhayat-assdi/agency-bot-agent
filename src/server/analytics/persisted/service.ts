import { and, eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { dataAvailability } from "@/server/db/schema";
import {
  aggregateSourceMetrics,
  compareMetric,
  detectAnomalies,
  evaluateDataSufficiency,
  rankEntities,
  type AnalyticsMetricSet,
  type InsightMetricInput,
  type MetricComparison
} from "@/server/analytics";
import type { MetaDateRange, MetaEntityLevel } from "@/server/meta/types";
import {
  fetchPersistedBreakdownRows,
  fetchPersistedHierarchy,
  fetchPersistedInsightRows,
  findPersistedAccount,
  persistedRowToInput,
  type PersistedAccountContext
} from "@/server/analytics/persisted/store";
import { toAnalyticsMetricSet } from "@/server/analytics/metrics/normalization";
import { clampPageLimit, clampPageOffset } from "@/server/analytics/query-bounds";
import { MetricsRepository } from "@/server/repositories/metrics-repository";

export type PersistedProvenance = {
  source: "persisted";
  generatedAt: string;
  accountId: string;
  dateRange: MetaDateRange;
};

function provenance(accountId: string, dateRange: MetaDateRange): PersistedProvenance {
  return { source: "persisted", generatedAt: new Date().toISOString(), accountId, dateRange };
}

function rowToInput(row: {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  outboundClicks: number | null;
  conversions: number | null;
  conversionValue: number | null;
  availability: InsightMetricInput["availability"];
}): InsightMetricInput {
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

export type AccountSummaryResult = {
  context: PersistedAccountContext;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  provenance: PersistedProvenance;
};

export async function getPersistedAccountSummary(
  db: Database,
  metaAccountId: string,
  range: MetaDateRange,
  previousRange: MetaDateRange
): Promise<AccountSummaryResult | null> {
  const context = await findPersistedAccount(db, metaAccountId);
  if (!context) return null;
  const rows = await fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level: "account", range });
  if (!rows) return null;
  const previousRows =
    (await fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level: "account", range: previousRange })) ?? [];
  return {
    context,
    metrics: aggregateSourceMetrics(rows.map(rowToInput)),
    previousMetrics: aggregateSourceMetrics(previousRows.map(rowToInput)),
    provenance: provenance(context.account.id, range)
  };
}

export type EntityPerformanceRow = {
  id: string;
  name: string;
  status: string;
  parentName?: string;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  comparison: MetricComparison;
  sufficiency: ReturnType<typeof evaluateDataSufficiency>;
};

export type EntityPerformanceResult = {
  context: PersistedAccountContext;
  entities: EntityPerformanceRow[];
  provenance: PersistedProvenance;
};

async function entityPerformance(
  db: Database,
  metaAccountId: string,
  level: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  filter?: { campaignId?: string; adSetId?: string },
  metricKey: "spend" | "roas" = "roas"
): Promise<EntityPerformanceResult | null> {
  const context = await findPersistedAccount(db, metaAccountId);
  if (!context) return null;
  const hierarchy = await fetchPersistedHierarchy(db, context.account, context.dbRowId);
  if (!hierarchy) return null;

  const definitions =
    level === "campaign"
      ? hierarchy.campaigns.map((entity) => ({ id: entity.id, name: entity.name, status: entity.effectiveStatus, parentName: undefined as string | undefined }))
      : level === "adset"
        ? hierarchy.adSets
            .filter((entity) => !filter?.campaignId || entity.campaignId === filter.campaignId)
            .map((entity) => ({
              id: entity.id,
              name: entity.name,
              status: entity.effectiveStatus,
              parentName: hierarchy.campaigns.find((campaign) => campaign.id === entity.campaignId)?.name
            }))
        : hierarchy.ads
            .filter(
              (entity) =>
                (!filter?.campaignId || entity.campaignId === filter.campaignId) && (!filter?.adSetId || entity.adSetId === filter.adSetId)
            )
            .map((entity) => ({
              id: entity.id,
              name: entity.name,
              status: entity.effectiveStatus,
              parentName: hierarchy.adSets.find((adSet) => adSet.id === entity.adSetId)?.name
            }));

  const [currentRows, previousRows] = await Promise.all([
    fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level, range, limit: 5000 }),
    fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level, range: previousRange, limit: 5000 })
  ]);
  if (!currentRows) return null;

  const groupByEntity = (rows: typeof currentRows) => {
    const groups = new Map<string, typeof currentRows>();
    for (const row of rows) {
      groups.set(row.entityId, [...(groups.get(row.entityId) ?? []), row]);
    }
    return groups;
  };
  const currentByEntity = groupByEntity(currentRows);
  const previousByEntity = groupByEntity(previousRows ?? []);

  const entities: EntityPerformanceRow[] = definitions.map((entity) => {
    const metrics = aggregateSourceMetrics((currentByEntity.get(entity.id) ?? []).map(rowToInput));
    const previousMetrics = aggregateSourceMetrics((previousByEntity.get(entity.id) ?? []).map(rowToInput));
    return {
      ...entity,
      metrics,
      previousMetrics,
      comparison: compareMetric(metrics[metricKey], previousMetrics[metricKey]),
      sufficiency: evaluateDataSufficiency(metrics)
    };
  });

  return { context, entities, provenance: provenance(context.account.id, range) };
}

export function getPersistedCampaignPerformance(
  db: Database,
  metaAccountId: string,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  options: { sort?: "spend" | "roas"; limit?: number; offset?: number; status?: string } = {}
) {
  return entityPerformance(db, metaAccountId, "campaign", range, previousRange).then((result) => {
    if (!result) return null;
    let entities = result.entities;
    if (options.status) entities = entities.filter((entity) => entity.status.toUpperCase() === options.status?.toUpperCase());
    const key = options.sort ?? "spend";
    entities = [...entities].sort((a, b) => (b.metrics[key].value ?? -1) - (a.metrics[key].value ?? -1));
    const offset = clampPageOffset(options.offset);
    const limit = clampPageLimit(options.limit);
    return { ...result, entities: entities.slice(offset, offset + limit), total: entities.length };
  });
}

export function getPersistedAdsetPerformance(
  db: Database,
  metaAccountId: string,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  options: { campaignId?: string; limit?: number; offset?: number } = {}
) {
  return entityPerformance(db, metaAccountId, "adset", range, previousRange, { campaignId: options.campaignId }).then((result) => {
    if (!result) return null;
    const offset = clampPageOffset(options.offset);
    const limit = clampPageLimit(options.limit);
    const sorted = [...result.entities].sort((a, b) => (b.metrics.spend.value ?? -1) - (a.metrics.spend.value ?? -1));
    return { ...result, entities: sorted.slice(offset, offset + limit), total: sorted.length };
  });
}

export function getPersistedAdPerformance(
  db: Database,
  metaAccountId: string,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  options: { campaignId?: string; adSetId?: string; limit?: number; offset?: number } = {}
) {
  return entityPerformance(db, metaAccountId, "ad", range, previousRange, options).then((result) => {
    if (!result) return null;
    const offset = clampPageOffset(options.offset);
    const limit = clampPageLimit(options.limit);
    const sorted = [...result.entities].sort((a, b) => (b.metrics.spend.value ?? -1) - (a.metrics.spend.value ?? -1));
    return { ...result, entities: sorted.slice(offset, offset + limit), total: sorted.length };
  });
}

export type PersistedBreakdownResult = {
  context: PersistedAccountContext;
  rows: Array<{ label: string; values: Record<string, string>; metrics: AnalyticsMetricSet; availabilitySummary: string[] }>;
  provenance: PersistedProvenance;
};

export async function getPersistedBreakdown(
  db: Database,
  metaAccountId: string,
  level: MetaEntityLevel,
  breakdowns: string[],
  range: MetaDateRange,
  entityKeys?: string[]
): Promise<PersistedBreakdownResult | null> {
  const context = await findPersistedAccount(db, metaAccountId);
  if (!context) return null;
  const rows = await fetchPersistedBreakdownRows(db, { accountDbId: context.dbRowId, account: context.account, level, breakdowns, range, entityKeys });
  if (!rows) return null;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = JSON.stringify(row.breakdownValues);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return {
    context,
    rows: [...groups.entries()]
      .map(([valuesJson, groupRows]) => {
        const values = JSON.parse(valuesJson) as Record<string, string>;
        const states = new Set<string>();
        for (const row of groupRows) {
          for (const [metric, state] of Object.entries(row.availability)) {
            if (state && state !== "available") states.add(`${metric}: ${state}`);
          }
        }
        return {
          label: Object.values(values).join(" / "),
          values,
          metrics: aggregateSourceMetrics(groupRows.map(rowToInput)),
          availabilitySummary: [...states].sort()
        };
      })
      .sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0)),
    provenance: provenance(context.account.id, range)
  };
}

export type PersistedTrendPoint = { date: string; spend: number; impressions: number; clicks: number; conversions: number; roas: number | null };

function rollupAvailability(nonNull: number, total: number): "available" | "partial" | "unavailable" {
  if (nonNull <= 0) return "unavailable";
  if (nonNull < total) return "partial";
  return "available";
}

export async function getPersistedTrend(db: Database, metaAccountId: string, range: MetaDateRange): Promise<{ context: PersistedAccountContext; points: PersistedTrendPoint[]; provenance: PersistedProvenance } | null> {
  const context = await findPersistedAccount(db, metaAccountId);
  if (!context) return null;
  // Prefer the SQL daily rollup so trend queries never hydrate entity-level
  // history into Node; fall back to row reads when the rollup is unavailable.
  try {
    const metrics = new MetricsRepository({ db, agencyId: "" });
    const rollup = await metrics.sumDailyByDate({ adAccountId: context.dbRowId, dateStart: range.since, dateStop: range.until });
    if (rollup.length > 0) {
      const points = rollup.map((day) => {
        const total = Number(day.rowCount);
        const set = toAnalyticsMetricSet({
          spend: day.spend === null ? null : Number(day.spend),
          impressions: day.impressions === null ? null : Number(day.impressions),
          clicks: day.clicks === null ? null : Number(day.clicks),
          conversions: day.conversions === null ? null : Number(day.conversions),
          availability: {
            spend: rollupAvailability(Number(day.spendCount), total),
            impressions: rollupAvailability(Number(day.impressionsCount), total),
            clicks: rollupAvailability(Number(day.clicksCount), total),
            conversions: rollupAvailability(Number(day.conversionsCount), total)
          }
        });
        return {
          date: day.date,
          spend: set.spend.value ?? 0,
          impressions: set.impressions.value ?? 0,
          clicks: set.clicks.value ?? 0,
          conversions: set.conversions.value ?? 0,
          roas: set.roas.value
        };
      });
      return { context, points, provenance: provenance(context.account.id, range) };
    }
  } catch {
    // Fall through to the row-based path below.
  }
  const rows = await fetchPersistedInsightRows(db, { accountDbId: context.dbRowId, account: context.account, level: "account", range });
  if (!rows) return null;
  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    byDate.set(row.dateStart, [...(byDate.get(row.dateStart) ?? []), row]);
  }
  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateRows]) => {
      const metrics = aggregateSourceMetrics(dateRows.map(rowToInput));
      return {
        date,
        spend: metrics.spend.value ?? 0,
        impressions: metrics.impressions.value ?? 0,
        clicks: metrics.clicks.value ?? 0,
        conversions: metrics.conversions.value ?? 0,
        roas: metrics.roas.value
      };
    });
  return { context, points, provenance: provenance(context.account.id, range) };
}

export async function comparePersistedPeriods(db: Database, metaAccountId: string, range: MetaDateRange, previousRange: MetaDateRange) {
  const summary = await getPersistedAccountSummary(db, metaAccountId, range, previousRange);
  if (!summary) return null;
  const keys = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "conversionValue", "roas"] as const;
  return {
    context: summary.context,
    comparisons: Object.fromEntries(keys.map((key) => [key, compareMetric(summary.metrics[key], summary.previousMetrics[key])])),
    provenance: summary.provenance
  };
}

export async function comparePersistedEntities(
  db: Database,
  metaAccountId: string,
  level: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  entityIds: string[],
  metricKey: "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "conversions" | "conversionValue" | "roas" = "roas"
) {
  const result = await entityPerformance(db, metaAccountId, level, range, previousRange);
  if (!result) return null;
  const selected = result.entities.filter((entity) => entityIds.includes(entity.id));
  return {
    context: result.context,
    entities: selected.map((entity) => ({ id: entity.id, name: entity.name, metrics: entity.metrics, comparison: compareMetric(entity.metrics[metricKey], entity.previousMetrics[metricKey]) })),
    provenance: result.provenance
  };
}

export async function getPersistedTopEntities(
  db: Database,
  metaAccountId: string,
  level: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  metricKey: "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "conversions" | "conversionValue" | "roas" = "roas",
  limit = 6
) {
  const result = await entityPerformance(db, metaAccountId, level, range, previousRange);
  if (!result) return null;
  const direction = metricKey === "cpc" ? "lower_is_better" : "higher_is_better";
  return { context: result.context, entities: rankEntities(result.entities, metricKey, direction).slice(0, limit), provenance: result.provenance };
}

export async function getPersistedBottomEntities(
  db: Database,
  metaAccountId: string,
  level: Extract<MetaEntityLevel, "campaign" | "adset" | "ad">,
  range: MetaDateRange,
  previousRange: MetaDateRange,
  metricKey: "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "conversions" | "conversionValue" | "roas" = "roas",
  limit = 6
) {
  const result = await entityPerformance(db, metaAccountId, level, range, previousRange);
  if (!result) return null;
  const direction = metricKey === "cpc" ? "higher_is_better" : "lower_is_better";
  return { context: result.context, entities: rankEntities(result.entities, metricKey, direction).slice(0, limit), provenance: result.provenance };
}

export async function getPersistedAnomalies(db: Database, metaAccountId: string, range: MetaDateRange, previousRange: MetaDateRange) {
  const summary = await getPersistedAccountSummary(db, metaAccountId, range, previousRange);
  if (!summary) return null;
  return { context: summary.context, anomalies: detectAnomalies(summary.metrics, summary.previousMetrics), provenance: summary.provenance };
}

export async function getPersistedDataAvailability(db: Database, metaAccountId: string, range: MetaDateRange) {
  const context = await findPersistedAccount(db, metaAccountId);
  if (!context) return null;
  const [stored, accountRows] = await Promise.all([
    db.query.dataAvailability.findMany({ where: and(eq(dataAvailability.adAccountId, context.dbRowId)), limit: 1000 }),
    new MetricsRepository({ db, agencyId: "" }).dailyByEntities({
      adAccountId: context.dbRowId,
      entityLevel: "account",
      dateStart: range.since,
      dateStop: range.until,
      limit: 5000
    })
  ]);
  if (stored.length === 0 && accountRows.length === 0) return null;
  const fromRows = accountRows.flatMap((row) => {
    const availability = persistedRowToInput(row).availability ?? {};
    return Object.entries(availability)
      .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1]) && entry[1] !== "available" && entry[1] !== "actual_zero")
      .map(([metricKey, state]) => ({ entityLevel: "account" as const, entityKey: row.entityKey, metricKey, state, dateStart: row.date, dateStop: row.date }));
  });
  return {
    context,
    states: [
      ...stored.map((row) => ({ entityLevel: row.entityLevel, entityKey: row.entityKey, metricKey: row.metricKey, state: row.state, dateStart: row.dateStart, dateStop: row.dateStop })),
      ...fromRows
    ],
    provenance: provenance(context.account.id, range)
  };
}
