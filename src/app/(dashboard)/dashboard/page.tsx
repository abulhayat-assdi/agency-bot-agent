import { AlertTriangle, CheckCircle2, Clock3, DatabaseZap } from "lucide-react";

import { FilterBar } from "@/components/dashboard/filter-bar";
import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceTrendChart } from "@/components/charts/performance-trend-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { compareMetric, evaluateDataSufficiency, rankEntities } from "@/server/analytics";
import { getDashboardData, parseDashboardFilters } from "@/server/dashboard/mock-dashboard-data";
import { formatDateRange } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const data = await getDashboardData(filters);
  const primaryCurrencySummary = data.currencySummaries[0];
  const deliveryMetrics = data.deliveryMetrics;
  const primaryMetrics = primaryCurrencySummary?.metrics;
  const primaryPreviousMetrics = primaryCurrencySummary?.previousMetrics;
  const topCampaigns = rankEntities(
    data.campaignSummaries.map((campaign) => ({ id: campaign.id, name: campaign.name, metrics: campaign.metrics, campaign })),
    "roas"
  ).slice(0, 8);

  const spendComparison = primaryMetrics && primaryPreviousMetrics ? compareMetric(primaryMetrics.spend, primaryPreviousMetrics.spend) : null;
  const roasComparison = primaryMetrics && primaryPreviousMetrics ? compareMetric(primaryMetrics.roas, primaryPreviousMetrics.roas) : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Dashboard</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Performance overview</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {formatDateRange(data.range)} · vs {formatDateRange(data.previousRange)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Read-only</Badge>
          <Badge variant="secondary">Last sync 2026-09-10 11:45 UTC</Badge>
        </div>
      </section>

      <FilterBar preset={filters.preset} clientId={filters.clientId} accountId={filters.accountId} clients={data.clients} accounts={data.accounts} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total clients" value={String(data.totals.clients)} helper="Client registry" accent="purple" />
        <KpiCard label="Connected accounts" value={`${data.totals.connectedAccounts}`} helper={`${data.totals.selectedAccounts} selected`} accent="green" />
        <KpiCard label="Impressions" value={formatMetric(deliveryMetrics.impressions)} metric={deliveryMetrics.impressions} helper="Selected scope" />
        <KpiCard label="Reach" value={formatMetric(deliveryMetrics.reach)} metric={deliveryMetrics.reach} helper="Meta estimate" />
        <KpiCard label="Clicks" value={formatMetric(deliveryMetrics.clicks)} metric={deliveryMetrics.clicks} helper="Provider clicks" />
        <KpiCard label="CTR" value={formatMetric(deliveryMetrics.ctr, { kind: "percent" })} metric={deliveryMetrics.ctr} helper="clicks / impressions × 100" />
        <KpiCard label="Conversions" value={formatMetric(deliveryMetrics.conversions)} metric={deliveryMetrics.conversions} helper="Conversion actions" accent="green" />
        <KpiCard label={`CPC (${primaryCurrencySummary?.currency ?? "n/a"})`} value={formatMetric(primaryMetrics?.cpc, { kind: "currency", currency: primaryCurrencySummary?.currency })} metric={primaryMetrics?.cpc} helper="Spend ÷ clicks" accent="amber" />
        <KpiCard label={`ROAS (${primaryCurrencySummary?.currency ?? "n/a"})`} value={formatMetric(primaryMetrics?.roas, { kind: "ratio" })} metric={primaryMetrics?.roas} helper="Value ÷ spend" accent="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Performance trend</CardTitle>
            <CardDescription>Daily trend for selected scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceTrendChart data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
            <CardDescription>Grouped by currency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.currencySummaries.map((summary) => {
              const sufficiency = evaluateDataSufficiency(summary.metrics);
              return (
                <div key={summary.currency} className="rounded-2xl metric-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{summary.currency}</h3>
                    <Badge variant={sufficiency.state === "reliable_enough_for_comparison" ? "success" : "warning"}>{sufficiency.state.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Spend</p>
                      <p className="font-semibold">{formatMetric(summary.metrics.spend, { kind: "currency", currency: summary.currency })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conv. value</p>
                      <p className="font-semibold">{formatMetric(summary.metrics.conversionValue, { kind: "currency", currency: summary.currency })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">CPM</p>
                      <p className="font-semibold">{formatMetric(summary.metrics.cpm, { kind: "currency", currency: summary.currency })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">CPA</p>
                      <p className="font-semibold">{formatMetric(summary.metrics.cpa, { kind: "currency", currency: summary.currency })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ROAS</p>
                      <p className="font-semibold">{formatMetric(summary.metrics.roas, { kind: "ratio" })}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Top campaigns by ROAS</CardTitle>
            <CardDescription>Unavailable ROAS excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsTable
              columns={["Campaign", "Client", "Account", "Spend", "Clicks", "Conv.", "Value", "ROAS"]}
              rows={topCampaigns.map(({ campaign }) => [
                campaign.name,
                campaign.clientName,
                campaign.accountName,
                formatMetric(campaign.metrics.spend, { kind: "currency", currency: campaign.currency }),
                formatMetric(campaign.metrics.clicks),
                formatMetric(campaign.metrics.conversions),
                formatMetric(campaign.metrics.conversionValue, { kind: "currency", currency: campaign.currency }),
                formatMetric(campaign.metrics.roas, { kind: "ratio" })
              ])}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deterministic alerts</CardTitle>
            <CardDescription>Rule-based only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.currencySummaries.flatMap((summary) => summary.anomalies).length ? (
              data.currencySummaries.flatMap((summary) =>
                summary.anomalies.map((anomaly) => (
                  <div key={`${summary.currency}-${anomaly.type}`} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      {anomaly.type.replaceAll("_", " ")} · {summary.currency}
                    </div>
                    <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{anomaly.explanation}</p>
                  </div>
                ))
              )
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  No threshold anomalies detected
                </div>
                <p className="mt-1 text-xs">Current vs previous period.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Period comparison</CardTitle>
            <CardDescription>Primary currency: {primaryCurrencySummary?.currency ?? "Unavailable"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-card/70 dark:bg-white/[0.03] p-3">
              <span className="text-muted-foreground">Spend change</span>
              <span className="font-semibold">{spendComparison ? formatMetric(spendComparison.percentageChange, { kind: "percent" }) : "Unavailable"}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-card/70 dark:bg-white/[0.03] p-3">
              <span className="text-muted-foreground">ROAS change</span>
              <span className="font-semibold">{roasComparison ? formatMetric(roasComparison.percentageChange, { kind: "percent" }) : "Unavailable"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data freshness</CardTitle>
            <CardDescription>Sync state for selected accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.accountSummaries.map((summary) => (
              <div key={summary.account.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card/70 dark:bg-white/[0.03] p-3 text-sm">
                <div>
                  <p className="font-medium">{summary.account.name}</p>
                  <p className="text-xs text-muted-foreground">{summary.account.timezone} · {summary.account.currency}</p>
                </div>
                <Badge variant="success">fresh</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data caveats</CardTitle>
            <CardDescription>Short accuracy notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.caveats.map((caveat) => (
              <div key={caveat} className="flex gap-2 text-sm text-muted-foreground">
                <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {caveat}
              </div>
            ))}
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Generated at {data.generatedAt}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
