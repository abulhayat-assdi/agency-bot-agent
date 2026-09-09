import { and, asc, between, eq } from "drizzle-orm";

import { breakdownMetricDaily, metricDaily, type NewMetricDaily } from "@/server/db/schema";
import type { RepositoryContext } from "@/server/repositories/types";

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

  async upsertDaily(input: NewMetricDaily) {
    const [row] = await this.context.db
      .insert(metricDaily)
      .values(input)
      .onConflictDoUpdate({
        target: [metricDaily.adAccountId, metricDaily.entityLevel, metricDaily.entityId, metricDaily.date],
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

  breakdownDaily(params: { adAccountId: string; breakdownKey: string; dateStart: string; dateStop: string }) {
    return this.context.db.query.breakdownMetricDaily.findMany({
      where: and(
        eq(breakdownMetricDaily.adAccountId, params.adAccountId),
        eq(breakdownMetricDaily.breakdownKey, params.breakdownKey),
        between(breakdownMetricDaily.date, params.dateStart, params.dateStop)
      ),
      orderBy: [asc(breakdownMetricDaily.date)]
    });
  }
}
