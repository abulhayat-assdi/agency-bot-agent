import { notFound } from "next/navigation";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportBreadcrumbs } from "@/components/reports/report-breadcrumbs";
import { ReportKpiGrid } from "@/components/reports/report-kpi-grid";
import { AnalyzeAdCard, AnomalyCard, BreakdownPreviewSections, DataHealthCard, PeriodComparisonCard, TrendTable } from "@/components/reports/report-sections";
import { getAdReport } from "@/server/reports/mock-report-data";
import { formatDateRange, type DateRangePreset } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ adId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function presetFrom(searchParams?: Record<string, string | string[] | undefined>): DateRangePreset {
  const value = searchParams?.preset;
  return (Array.isArray(value) ? value[0] : value) as DateRangePreset || "last_7_days";
}

export default async function IndividualAdReportPage({ params, searchParams }: Props) {
  const { adId } = await params;
  const report = await getAdReport(adId, presetFrom(await searchParams));

  if (!report || !report.context.ad || !report.context.adSet || !report.context.campaign) notFound();

  const creative = report.context.creative;

  return (
    <div className="space-y-6">
      <ReportBreadcrumbs context={report.context} />
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-eyebrow">Individual Ad Report</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{report.context.ad.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.context.ad.id} · Campaign {report.context.campaign.name} · Ad set {report.context.adSet.name} · {formatDateRange(report.range)}
          </p>
        </div>
        <Badge variant={report.context.ad.effectiveStatus === "ACTIVE" ? "success" : "secondary"}>{report.context.ad.effectiveStatus}</Badge>
      </section>

      <ReportKpiGrid metrics={report.metrics} currency={report.context.account.currency} />

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Creative and delivery context</CardTitle>
            <CardDescription>Creative metadata is read-only and sourced from the mock provider.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-card/70 dark:bg-white/[0.03] p-4"><p className="text-muted-foreground">Creative ID</p><p className="mt-1 font-semibold">{creative?.id ?? "Unavailable"}</p></div>
              <div className="rounded-2xl bg-card/70 dark:bg-white/[0.03] p-4"><p className="text-muted-foreground">Creative type</p><p className="mt-1 font-semibold">{creative?.objectType ?? "Unavailable"}</p></div>
              <div className="rounded-2xl bg-card/70 dark:bg-white/[0.03] p-4"><p className="text-muted-foreground">Optimization goal</p><p className="mt-1 font-semibold">{report.context.adSet.optimizationGoal}</p></div>
              <div className="rounded-2xl bg-card/70 dark:bg-white/[0.03] p-4"><p className="text-muted-foreground">Attribution/reporting context</p><p className="mt-1 font-semibold">Mixed report time · mock attribution windows</p></div>
            </div>
          </CardContent>
        </Card>
        <AnalyzeAdCard report={report} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Conversion value" value={formatMetric(report.metrics.conversionValue, { kind: "currency", currency: report.context.account.currency })} metric={report.metrics.conversionValue} accent="green" />
        <KpiCard label="Outbound clicks" value={formatMetric(report.metrics.outboundClicks)} metric={report.metrics.outboundClicks} />
        <KpiCard label="Data sufficiency" value={report.sufficiency.state.replaceAll("_", " ")} helper="Deterministic volume label, not statistical significance" accent="purple" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <PeriodComparisonCard report={report} />
        <AnomalyCard report={report} />
      </div>
      <TrendTable report={report} />
      <BreakdownPreviewSections report={report} />
      <DataHealthCard report={report} />
    </div>
  );
}
