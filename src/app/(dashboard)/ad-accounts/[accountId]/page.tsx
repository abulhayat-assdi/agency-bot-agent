import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";

export const dynamic = "force-dynamic";

const tabs = ["Overview", "Campaigns", "Ad Sets", "Ads", "Breakdowns", "Trends", "AI Insights", "Reports", "Email Reports", "Data Health"];

export default async function AdAccountOverviewPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const data = await getDashboardData({ preset: "last_7_days", accountId });
  const summary = data.accountSummaries.find((item) => item.account.id === accountId);

  if (!summary) notFound();

  const campaigns = data.campaignSummaries.filter((campaign) => campaign.accountId === accountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Ad Account Overview</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{summary.account.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.account.id} · {summary.account.currency} · {summary.account.timezone} · Last sync {summary.lastSyncAt}
          </p>
        </div>
        <Badge variant="success">{summary.account.accessStatus}</Badge>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <Badge key={tab} variant={tab === "Overview" ? "default" : "secondary"}>{tab}</Badge>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Spend" value={formatMetric(summary.metrics.spend, { kind: "currency", currency: summary.account.currency })} metric={summary.metrics.spend} accent="amber" />
        <KpiCard label="Impressions" value={formatMetric(summary.metrics.impressions)} metric={summary.metrics.impressions} />
        <KpiCard label="CTR" value={formatMetric(summary.metrics.ctr, { kind: "percent" })} metric={summary.metrics.ctr} />
        <KpiCard label="ROAS" value={formatMetric(summary.metrics.roas, { kind: "ratio" })} metric={summary.metrics.roas} accent="green" />
        <KpiCard label="Clicks" value={formatMetric(summary.metrics.clicks)} metric={summary.metrics.clicks} />
        <KpiCard label="CPC" value={formatMetric(summary.metrics.cpc, { kind: "currency", currency: summary.account.currency })} metric={summary.metrics.cpc} />
        <KpiCard label="Conversions" value={formatMetric(summary.metrics.conversions)} metric={summary.metrics.conversions} accent="purple" />
        <KpiCard label="CPA" value={formatMetric(summary.metrics.cpa, { kind: "currency", currency: summary.account.currency })} metric={summary.metrics.cpa} accent="amber" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Campaign report</CardTitle>
          <CardDescription>Campaign-level rows are derived from child ad metrics for the selected account and period.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Campaign", "Spend", "Impressions", "Clicks", "CTR", "CPC", "Conv.", "Value", "ROAS"]}
            rows={campaigns.map((campaign) => [
              <Button key="campaign" asChild variant="ghost" size="sm"><Link href={`/dashboard?accountId=${accountId}`}>{campaign.name}</Link></Button>,
              formatMetric(campaign.metrics.spend, { kind: "currency", currency: campaign.currency }),
              formatMetric(campaign.metrics.impressions),
              formatMetric(campaign.metrics.clicks),
              formatMetric(campaign.metrics.ctr, { kind: "percent" }),
              formatMetric(campaign.metrics.cpc, { kind: "currency", currency: campaign.currency }),
              formatMetric(campaign.metrics.conversions),
              formatMetric(campaign.metrics.conversionValue, { kind: "currency", currency: campaign.currency }),
              formatMetric(campaign.metrics.roas, { kind: "ratio" })
            ])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
