import Link from "next/link";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { clientSummariesFromDashboard, getDashboardData } from "@/server/dashboard/mock-dashboard-data";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const data = await getDashboardData({ preset: "last_7_days" });
  const clients = clientSummariesFromDashboard(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Clients</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Client portfolio</h2>
          <p className="mt-2 text-sm text-muted-foreground">Last 7 days · account-currency scoped.</p>
        </div>
        <Badge variant="success">{clients.length} active clients</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Clients" value={String(data.totals.clients)} helper="Managed clients" accent="purple" />
        <KpiCard label="Connected accounts" value={String(data.totals.connectedAccounts)} helper="Connected accounts" accent="green" />
        <KpiCard label="Portfolio clicks" value={formatMetric(data.deliveryMetrics.clicks)} metric={data.deliveryMetrics.clicks} helper="Total clicks" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Client list</CardTitle>
          <CardDescription>Verified mock analytics.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Client", "Status", "Accounts", "Impressions", "Clicks", "CTR", "Conversions", "Open"]}
            rows={clients.map(({ client, accounts, metrics }) => [
              client.name,
              <Badge key="status" variant="success">{client.status}</Badge>,
              accounts.length,
              formatMetric(metrics.impressions),
              formatMetric(metrics.clicks),
              formatMetric(metrics.ctr, { kind: "percent" }),
              formatMetric(metrics.conversions),
              <Button key="open" asChild variant="outline" size="sm"><Link href={`/clients/${client.id}`}>Open client</Link></Button>
            ])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
