import { notFound } from "next/navigation";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportBreadcrumbs } from "@/components/reports/report-breadcrumbs";
import { ReportKpiGrid } from "@/components/reports/report-kpi-grid";
import { AnomalyCard, BreakdownPreviewSections, ChildPerformanceTable, DataHealthCard, PeriodComparisonCard, TrendTable } from "@/components/reports/report-sections";
import { getCampaignReport } from "@/server/reports/mock-report-data";
import { formatDateRange, type DateRangePreset } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function presetFrom(searchParams?: Record<string, string | string[] | undefined>): DateRangePreset {
  const value = searchParams?.preset;
  return (Array.isArray(value) ? value[0] : value) as DateRangePreset || "last_7_days";
}

export default async function CampaignReportPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const report = await getCampaignReport(campaignId, presetFrom(await searchParams));

  if (!report || !report.context.campaign) notFound();

  return (
    <div className="space-y-6">
      <ReportBreadcrumbs context={report.context} />
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-eyebrow">Campaign Report</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{report.context.campaign.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.context.campaign.id} · Objective {report.context.campaign.objective} · {formatDateRange(report.range)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={report.context.campaign.effectiveStatus === "ACTIVE" ? "success" : "secondary"}>{report.context.campaign.effectiveStatus}</Badge>
          <Badge variant="secondary">{report.context.account.currency}</Badge>
        </div>
      </section>

      <ReportKpiGrid metrics={report.metrics} currency={report.context.account.currency} />

      <section className="grid gap-4 xl:grid-cols-3">
        <KpiCard label="Objective" value={report.context.campaign.objective} helper="Meta campaign objective/context" accent="purple" />
        <KpiCard label="Buying type" value={report.context.campaign.buyingType} helper="Reporting context from mock provider" />
        <KpiCard label="Conv. value" value={formatMetric(report.metrics.conversionValue, { kind: "currency", currency: report.context.account.currency })} metric={report.metrics.conversionValue} accent="green" />
      </section>

      <ChildPerformanceTable report={report} childType="adsets" />
      <div className="grid gap-4 xl:grid-cols-2">
        <PeriodComparisonCard report={report} />
        <AnomalyCard report={report} />
      </div>
      <TrendTable report={report} />
      <BreakdownPreviewSections report={report} />
      <DataHealthCard report={report} />

      <Card>
        <CardHeader>
          <CardTitle>Attribution context</CardTitle>
          <CardDescription>Mock reports use mixed action report time and ad-set style attribution windows where applicable.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Primary conversion metrics use provider action data when available. Unsupported or unavailable values stay null and are surfaced in metric state labels.
        </CardContent>
      </Card>
    </div>
  );
}
