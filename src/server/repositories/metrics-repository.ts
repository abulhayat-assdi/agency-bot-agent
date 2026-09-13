import { and, asc, between, eq, inArray, max, sql } from "drizzle-orm";

import {
  breakdownMetricDaily,
  metricDaily,
  metricPeriod,
  type NewBreakdownMetricDaily,
  type NewMetricDaily,
  type NewMetricPeriod
} from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";
import { assertAnalyticsRange, clampRowLimit } from "@/server/analytics/query-bounds";

type DailyInsert = Omit<NewMetricDaily, "id" | "createdAt">;
type BreakdownInsert = Omit<NewBreakdownMetricDaily, "id" | "createdAt">;
type PeriodInsert = Omit<NewMetricPeriod, "id" | "createdAt">;

const DAILY_CONFLICT_SET = (input: DailyInsert) => ({
  timezone: input.timezone,
  currency: input.currency,
  attributionContext: input.attributionContext,
  spend: input.spend,
  impressions: input.impressions,
  reach: input.reach,
  clicks: input.clicks,
  linkClicks: input.linkClicks,
  outboundClicks: input.outboundClicks,
  conversions: input.conversions,
  conversionValue: input.conversionValue,
  videoMetrics: input.videoMetrics,
  engagementMetrics: input.engagementMetrics,
  actionMetrics: input.actionMetrics,
  sourceFields: input.sourceFields,
  availabilityState: input.availabilityState,
  syncRunId: input.syncRunId
});

export class MetricsRepository {
  constructor(private readonly context: RepositoryContext) {}

  dailyByAccount(params: { adAccountId: string; dateStart: string; dateStop: string }) {
    return this.context.db.query.metricDaily.findMany({
      where: and(
        eq(metricDaily.adAccountId, params.adAccountId),
        eq(metricDaily.entityLevel, "account"),
        between(metricDaily.date, params.dateStart, params.dateStop)
      ),
      orderBy: [asc(metricDaily.date)]
    });
  }

  dailyByEntities(params: {
    adAccountId: string;
    entityLevel: "account" | "campaign" | "adset" | "ad";
    entityKeys?: string[];
    dateStart: string;
    dateStop: string;
    limit?: number;
  }) {
    assertAnalyticsRange(params.dateStart, params.dateStop);
    const filters = [
      eq(metricDaily.adAccountId, params.adAccountId),
      eq(metricDaily.entityLevel, params.entityLevel),
      between(metricDaily.date, params.dateStart, params.dateStop)
    ];
    if (params.entityKeys && params.entityKeys.length > 0) {
      filters.push(inArray(metricDaily.entityKey, params.entityKeys));
    }
    return this.context.db.query.metricDaily.findMany({
      where: and(...filters),
      orderBy: [asc(metricDaily.date)],
      limit: clampRowLimit(params.limit)
    });
  }

  /** Newest synced account-level date without scanning rows (freshness checks). */
  async maxDailyDate(adAccountId: string, entityLevel: "account" | "campaign" | "adset" | "ad" = "account"): Promise<string | null> {
    const [row] = await this.context.db
      .select({ value: max(metricDaily.date) })
      .from(metricDaily)
      .where(and(eq(metricDaily.adAccountId, adAccountId), eq(metricDaily.entityLevel, entityLevel)));
    return row?.value ?? null;
  }

  /**
   * Account-level daily rollup computed in PostgreSQL (SUM + non-null counts
   * per metric), so trend queries never hydrate entity-level history into Node.
   * Null semantics: a metric sums only present values; nonNull counts let the
   * caller mark unavailable vs partial honestly.
   */
  async sumDailyByDate(params: { adAccountId: string; dateStart: string; dateStop: string }) {
    assertAnalyticsRange(params.dateStart, params.dateStop);
    return this.context.db
      .select({
        date: metricDaily.date,
        spend: sql<string | null>`sum(${metricDaily.spend})`,
        impressions: sql<string | null>`sum(${metricDaily.impressions})`,
        clicks: sql<string | null>`sum(${metricDaily.clicks})`,
        conversions: sql<string | null>`sum(${metricDaily.conversions})`,
        rowCount: sql<string>`count(*)`,
        spendCount: sql<string>`count(${metricDaily.spend})`,
        impressionsCount: sql<string>`count(${metricDaily.impressions})`,
        clicksCount: sql<string>`count(${metricDaily.clicks})`,
        conversionsCount: sql<string>`count(${metricDaily.conversions})`
      })
      .from(metricDaily)
      .where(
        and(
          eq(metricDaily.adAccountId, params.adAccountId),
          eq(metricDaily.entityLevel, "account"),
          between(metricDaily.date, params.dateStart, params.dateStop)
        )
      )
      .groupBy(metricDaily.date)
      .orderBy(asc(metricDaily.date));
  }

  async upsertDaily(input: DailyInsert) {
    const [row] = await this.context.db
      .insert(metricDaily)
      // Unique scope is (adAccountId, entityLevel, entityKey, date); entityId is
      // a nullable FK and must not be part of the conflict target.
      .values(input)
      .onConflictDoUpdate({
        target: [metricDaily.adAccountId, metricDaily.entityLevel, metricDaily.entityKey, metricDaily.date],
        set: DAILY_CONFLICT_SET(input)
      })
      .returning();

    return row;
  }

  async upsertDailyMany(inputs: DailyInsert[]) {
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.upsertDaily(input));
    }
    return rows;
  }

  async upsertPeriod(input: PeriodInsert) {
    const [row] = await this.context.db
      .insert(metricPeriod)
      .values(input)
      .onConflictDoUpdate({
        target: [metricPeriod.adAccountId, metricPeriod.entityLevel, metricPeriod.entityKey, metricPeriod.dateStart, metricPeriod.dateStop],
        set: {
          timezone: input.timezone,
          currency: input.currency,
          attributionContext: input.attributionContext,
          spend: input.spend,
          impressions: input.impressions,
          reach: input.reach,
          clicks: input.clicks,
          linkClicks: input.linkClicks,
          outboundClicks: input.outboundClicks,
          conversions: input.conversions,
          conversionValue: input.conversionValue,
          videoMetrics: input.videoMetrics,
          engagementMetrics: input.engagementMetrics,
          actionMetrics: input.actionMetrics,
          sourceFields: input.sourceFields,
          availabilityState: input.availabilityState,
          syncRunId: input.syncRunId
        }
      })
      .returning();

    return row;
  }

  async upsertBreakdownDaily(input: BreakdownInsert) {
    const [row] = await this.context.db
      .insert(breakdownMetricDaily)
      .values(input)
      .onConflictDoUpdate({
        target: [
          breakdownMetricDaily.adAccountId,
          breakdownMetricDaily.entityLevel,
          breakdownMetricDaily.entityKey,
          breakdownMetricDaily.breakdownKey,
          breakdownMetricDaily.breakdownHash,
          breakdownMetricDaily.date
        ],
        set: {
          timezone: input.timezone,
          currency: input.currency,
          attributionContext: input.attributionContext,
          spend: input.spend,
          impressions: input.impressions,
          reach: input.reach,
          clicks: input.clicks,
          linkClicks: input.linkClicks,
          outboundClicks: input.outboundClicks,
          conversions: input.conversions,
          conversionValue: input.conversionValue,
          videoMetrics: input.videoMetrics,
          engagementMetrics: input.engagementMetrics,
          actionMetrics: input.actionMetrics,
          sourceFields: input.sourceFields,
          availabilityState: input.availabilityState,
          syncRunId: input.syncRunId
        }
      })
      .returning();

    return row;
  }

  async upsertBreakdownDailyMany(inputs: BreakdownInsert[]) {
    const rows = [];
    for (const input of inputs) {
      rows.push(await this.upsertBreakdownDaily(input));
    }
    return rows;
  }

  breakdownDaily(params: { adAccountId: string; breakdownKey: string; dateStart: string; dateStop: string; entityKeys?: string[]; limit?: number }) {
    assertAnalyticsRange(params.dateStart, params.dateStop);
    const filters = [
      eq(breakdownMetricDaily.adAccountId, params.adAccountId),
      eq(breakdownMetricDaily.breakdownKey, params.breakdownKey),
      between(breakdownMetricDaily.date, params.dateStart, params.dateStop)
    ];
    if (params.entityKeys && params.entityKeys.length > 0) {
      filters.push(inArray(breakdownMetricDaily.entityKey, params.entityKeys));
    }
    return this.context.db.query.breakdownMetricDaily.findMany({
      where: and(...filters),
      orderBy: [asc(breakdownMetricDaily.date)],
      limit: clampRowLimit(params.limit)
    });
  }
}
