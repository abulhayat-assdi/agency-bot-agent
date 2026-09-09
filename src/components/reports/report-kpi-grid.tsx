import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatMetric } from "@/components/dashboard/metric-format";
import type { AnalyticsMetricSet } from "@/server/analytics";

export function ReportKpiGrid({ metrics, currency }: { metrics: AnalyticsMetricSet; currency: string }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Spend" value={formatMetric(metrics.spend, { kind: "currency", currency })} metric={metrics.spend} accent="amber" />
      <KpiCard label="Impressions" value={formatMetric(metrics.impressions)} metric={metrics.impressions} />
      <KpiCard label="Reach" value={formatMetric(metrics.reach)} metric={metrics.reach} />
      <KpiCard label="Frequency" value={formatMetric(metrics.frequency, { kind: "ratio" })} metric={metrics.frequency} />
      <KpiCard label="Clicks" value={formatMetric(metrics.clicks)} metric={metrics.clicks} />
      <KpiCard label="CTR" value={formatMetric(metrics.ctr, { kind: "percent" })} metric={metrics.ctr} />
      <KpiCard label="CPC" value={formatMetric(metrics.cpc, { kind: "currency", currency })} metric={metrics.cpc} accent="amber" />
      <KpiCard label="CPM" value={formatMetric(metrics.cpm, { kind: "currency", currency })} metric={metrics.cpm} accent="amber" />
      <KpiCard label="Conversions" value={formatMetric(metrics.conversions)} metric={metrics.conversions} accent="purple" />
      <KpiCard label="CPA" value={formatMetric(metrics.cpa, { kind: "currency", currency })} metric={metrics.cpa} accent="amber" />
      <KpiCard label="Conv. rate" value={formatMetric(metrics.conversionRate, { kind: "percent" })} metric={metrics.conversionRate} accent="purple" />
      <KpiCard label="ROAS" value={formatMetric(metrics.roas, { kind: "ratio" })} metric={metrics.roas} accent="green" />
    </section>
  );
}
