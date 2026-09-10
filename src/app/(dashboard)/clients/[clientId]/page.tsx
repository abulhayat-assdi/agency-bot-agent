import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { clientSummariesFromDashboard, getDashboardData } from "@/server/dashboard/mock-dashboard-data";

export const dynamic = "force-dynamic";

export default async function ClientOverviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const data = await getDashboardData({ preset: "last_7_days", clientId });
  const summary = clientSummariesFromDashboard(data).find((item) => item.client.id === clientId);

  if (!summary) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="section-eyebrow">Client Overview</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{summary.client.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Consolidated account performance for the selected client. Currency-specific financial summaries remain separated.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Accounts" value={String(summary.accounts.length)} helper="Connected ad accounts" accent="green" />
        <KpiCard label="Impressions" value={formatMetric(summary.metrics.impressions)} metric={summary.metrics.impressions} />
        <KpiCard label="Clicks" value={formatMetric(summary.metrics.clicks)} metric={summary.metrics.clicks} />
        <KpiCard label="CTR" value={formatMetric(summary.metrics.ctr, { kind: "percent" })} metric={summary.metrics.ctr} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ad accounts</CardTitle>
          <CardDescription>Account timezone, currency, freshness, and selected-period delivery.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Account", "Currency", "Timezone", "Impressions", "Clicks", "Conversions", "Open"]}
            rows={summary.accounts.map(({ account, metrics }) => [
              account.name,
              account.currency,
              account.timezone,
              formatMetric(metrics.impressions),
              formatMetric(metrics.clicks),
              formatMetric(metrics.conversions),
              <Button key="open" asChild variant="outline" size="sm"><Link href={`/ad-accounts/${account.id}`}>Open account</Link></Button>
            ])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
