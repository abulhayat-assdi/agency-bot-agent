import Link from "next/link";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";

export const dynamic = "force-dynamic";

export default async function AdAccountsPage() {
  const data = await getDashboardData({ preset: "last_7_days" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Ad Accounts</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Connected Meta account registry</h2>
          <p className="mt-2 text-sm text-muted-foreground">Read-only account metadata, timezone, currency, sync freshness, and reporting summary.</p>
        </div>
        <Badge variant="success">Read-only provider</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Accounts" value={String(data.accounts.length)} helper="Mock connected accounts" accent="green" />
        <KpiCard label="Selected impressions" value={formatMetric(data.deliveryMetrics.impressions)} metric={data.deliveryMetrics.impressions} />
        <KpiCard label="Selected conversions" value={formatMetric(data.deliveryMetrics.conversions)} metric={data.deliveryMetrics.conversions} accent="purple" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Account health</CardTitle>
          <CardDescription>Currency and timezone are visible to prevent incorrect reporting assumptions.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Account", "Client", "Currency", "Timezone", "Access", "Spend", "CTR", "ROAS", "Open"]}
            rows={data.accountSummaries.map(({ account, client, metrics }) => [
              account.name,
              client.name,
              account.currency,
              account.timezone,
              <Badge key="access" variant="success">{account.accessStatus}</Badge>,
              formatMetric(metrics.spend, { kind: "currency", currency: account.currency }),
              formatMetric(metrics.ctr, { kind: "percent" }),
              formatMetric(metrics.roas, { kind: "ratio" }),
              <Button key="open" asChild variant="outline" size="sm"><Link href={`/ad-accounts/${account.id}`}>Open account</Link></Button>
            ])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
