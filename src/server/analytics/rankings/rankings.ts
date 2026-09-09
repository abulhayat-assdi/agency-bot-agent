import type { AnalyticsMetricSet } from "@/server/analytics/metrics/types";
import { isMetricUsable } from "@/server/analytics/metrics/value";

export type RankDirection = "higher_is_better" | "lower_is_better";

export type RankedEntity = {
  id: string;
  name: string;
  metrics: AnalyticsMetricSet;
};

export function rankEntities<T extends RankedEntity>(entities: T[], metricKey: keyof AnalyticsMetricSet, direction: RankDirection = "higher_is_better") {
  const ranked = entities
    .filter((entity) => isMetricUsable(entity.metrics[metricKey]))
    .sort((a, b) => {
      const aValue = a.metrics[metricKey].value ?? 0;
      const bValue = b.metrics[metricKey].value ?? 0;
      return direction === "higher_is_better" ? bValue - aValue : aValue - bValue;
    });

  return ranked.map((entity, index) => ({ ...entity, rank: index + 1 }));
}
