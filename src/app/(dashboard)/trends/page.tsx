import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, DatabaseZap } from "lucide-react";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AccountTrendChart } from "@/components/trends/account-trend-chart";
import { TrendControls } from "@/components/trends/trend-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getTrendDashboardData, type ComparisonMetricKey, type TrendQuery } from "@/server/trends";
import { formatDateRange, type DateRangePreset } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(params: Record<string, string | string[] | undefined> | undefined): TrendQuery {
  return {
    accountId: readParam(params, "accountId"),
    preset: (readParam(params, "preset") as DateRangePreset | undefined) ?? "last_7_days",
    entityLevel: (readParam(params, "entityLevel") as TrendQuery["entityLevel"]) ?? "campaign",
    metricKey: (readParam(params, "metricKey") as ComparisonMetricKey | undefined) ?? "roas"
  };
}

function comparisonValueKind(metricKey: ComparisonMetricKey) {
  if (["spend", "cpc", "cpa", "conversionValue"].includes(metricKey)) return "currency" as const;
  if (["ctr"].includes(metricKey)) return "percent" as const;
  if (["roas"].includes(metricKey)) return "ratio" as const;
  return "number" as const;
}

function metricLabel(metricKey: string) {
  return metricKey.replaceAll(/([A-Z])/g, " $1").toUpperCase();
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const query = parseQuery(await searchParams);
  const data = await getTrendDashboardData(query);
  const preset = query.preset ?? "last_7_days";
  const valueKind = comparisonValueKind(data.metricKey);
  const primaryComparison = data.accountComparisons[data.metricKey];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Trends and Comparison</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Performance movement intelligence</h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            {data.selectedAccount.name} · {formatDateRange(data.range)} vs {formatDateRange(data.previousRange)} · Ranking {data.entityLevel}s by {metricLabel(data.metricKey)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Deterministic comparison</Badge>
          <Badge variant="secondary">{data.selectedAccount.currency}</Badge>
        </div>
      </section>

      <TrendControls data={data} preset={preset} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current spend" value={formatMetric(data.accountMetrics.spend, { kind: "currency", currency: data.selectedAccount.currency })} metric={data.accountMetrics.spend} accent="amber" />
        <KpiCard label="Current ROAS" value={formatMetric(data.accountMetrics.roas, { kind: "ratio" })} metric={data.accountMetrics.roas} accent="green" />
        <KpiCard label="Current CTR" value={formatMetric(data.accountMetrics.ctr, { kind: "percent" })} metric={data.accountMetrics.ctr} />
        <KpiCard label="Current conversions" value={formatMetric(data.accountMetrics.conversions)} metric={data.accountMetrics.conversions} accent="purple" />
        <KpiCard label={`${metricLabel(data.metricKey)} absolute change`} value={formatMetric(primaryComparison.absoluteChange, { kind: valueKind, currency: data.selectedAccount.currency })} metric={primaryComparison.absoluteChange} />
        <KpiCard label={`${metricLabel(data.metricKey)} % change`} value={formatMetric(primaryComparison.percentageChange, { kind: "percent" })} metric={primaryComparison.percentageChange} accent="purple" />
        <KpiCard label="Compared entities" value={String(data.entities.length)} helper={`Active ${data.entityLevel} comparison set`} />
        <KpiCard label="Anomalies" value={String(data.accountAnomalies.length)} helper="Threshold-based current vs previous period" accent={data.accountAnomalies.length ? "amber" : "green"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account-level trend</CardTitle>
            <CardDescription>Daily spend, clicks, conversions, and ROAS for the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTrendChart data={data.dailyTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top movement drivers</CardTitle>
            <CardDescription>Largest absolute percentage movements for {metricLabel(data.metricKey)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topMovers.map((entity) => (
              <div key={entity.id} className="rounded-2xl metric-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{entity.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entity.parentName ?? data.selectedAccount.name}</p>
                  </div>
                  <Badge variant={entity.comparison.direction === "down" ? "warning" : "success"}>{entity.comparison.direction}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">% change</span>
                  <span className="font-semibold">{formatMetric(entity.comparison.percentageChange, { kind: "percent" })}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top {data.entityLevel}s</CardTitle>
            <CardDescription>Ranked by {metricLabel(data.metricKey)}. Unavailable metrics are excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsTable
              columns={["Rank", "Name", "Current", "Previous", "% change", "Sufficiency", "Open"]}
              rows={data.topEntities.map((entity) => [
                entity.rank,
                entity.name,
                formatMetric(entity.metrics[data.metricKey], { kind: valueKind, currency: data.selectedAccount.currency }),
                formatMetric(entity.previousMetrics[data.metricKey], { kind: valueKind, currency: data.selectedAccount.currency }),
                formatMetric(entity.comparison.percentageChange, { kind: "percent" }),
                entity.sufficiency.state.replaceAll("_", " "),
                <Button key="open" asChild size="sm" variant="outline"><Link href={entity.reportHref}>Open</Link></Button>
              ])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bottom {data.entityLevel}s</CardTitle>
            <CardDescription>For CPA/CPC, lower values are ranked as better; this table reverses the direction.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsTable
              columns={["Rank", "Name", "Current", "Previous", "% change", "Status", "Open"]}
              rows={data.bottomEntities.map((entity) => [
                entity.rank,
                entity.name,
                formatMetric(entity.metrics[data.metricKey], { kind: valueKind, currency: data.selectedAccount.currency }),
                formatMetric(entity.previousMetrics[data.metricKey], { kind: valueKind, currency: data.selectedAccount.currency }),
                formatMetric(entity.comparison.percentageChange, { kind: "percent" }),
                <Badge key="status" variant={entity.status === "ACTIVE" ? "success" : "secondary"}>{entity.status}</Badge>,
                <Button key="open" asChild size="sm" variant="outline"><Link href={entity.reportHref}>Open</Link></Button>
              ])}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Period-over-period account comparison</CardTitle>
          <CardDescription>All changes come from deterministic analytics utilities.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Metric", "Current", "Previous", "Absolute change", "% change", "Direction"]}
            rows={(Object.keys(data.accountComparisons) as ComparisonMetricKey[]).map((key) => {
              const comparison = data.accountComparisons[key];
              const kind = comparisonValueKind(key);
              return [
                metricLabel(key),
                formatMetric(data.accountMetrics[key], { kind, currency: data.selectedAccount.currency }),
                formatMetric(data.previousAccountMetrics[key], { kind, currency: data.selectedAccount.currency }),
                formatMetric(comparison.absoluteChange, { kind, currency: data.selectedAccount.currency }),
                formatMetric(comparison.percentageChange, { kind: "percent" }),
                comparison.direction === "up" ? <span key="up" className="inline-flex items-center gap-1 text-emerald-300"><ArrowUpRight className="h-4 w-4" />up</span> : comparison.direction === "down" ? <span key="down" className="inline-flex items-center gap-1 text-amber-300"><ArrowDownRight className="h-4 w-4" />down</span> : comparison.direction
              ];
            })}
          />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Anomaly checks</CardTitle>
            <CardDescription>Deterministic threshold rules applied to account-level current vs previous period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.accountAnomalies.length ? (
              data.accountAnomalies.map((anomaly) => (
                <div key={anomaly.type} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-100">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {anomaly.type.replaceAll("_", " ")} · {anomaly.severity}
                  </div>
                  <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{anomaly.explanation}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">No configured threshold anomalies detected.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparison caveats</CardTitle>
            <CardDescription>Guardrails for trustworthy interpretation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.caveats.map((caveat) => (
              <div key={caveat} className="flex gap-2 text-sm text-muted-foreground">
                <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {caveat}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
