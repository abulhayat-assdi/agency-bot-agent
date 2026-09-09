import { notFound } from "next/navigation";

import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { ReportBreadcrumbs } from "@/components/reports/report-breadcrumbs";
import { ReportKpiGrid } from "@/components/reports/report-kpi-grid";
import { AnomalyCard, BreakdownPreviewSections, ChildPerformanceTable, DataHealthCard, PeriodComparisonCard, TrendTable } from "@/components/reports/report-sections";
import { getAdSetReport } from "@/server/reports/mock-report-data";
import { formatDateRange, type DateRangePreset } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ adSetId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function presetFrom(searchParams?: Record<string, string | string[] | undefined>): DateRangePreset {
  const value = searchParams?.preset;
  return (Array.isArray(value) ? value[0] : value) as DateRangePreset || "last_7_days";
}

export default async function AdSetReportPage({ params, searchParams }: Props) {
  const { adSetId } = await params;
  const report = await getAdSetReport(adSetId, presetFrom(await searchParams));

  if (!report || !report.context.adSet) notFound();

  return (
    <div className="space-y-6">
      <ReportBreadcrumbs context={report.context} />
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Ad Set Report</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{report.context.adSet.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.context.adSet.id} · {report.context.adSet.optimizationGoal} · {formatDateRange(report.range)}
          </p>
        </div>
        <Badge variant={report.context.adSet.effectiveStatus === "ACTIVE" ? "success" : "secondary"}>{report.context.adSet.effectiveStatus}</Badge>
      </section>

      <ReportKpiGrid metrics={report.metrics} currency={report.context.account.currency} />

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Optimization" value={report.context.adSet.optimizationGoal} helper="Meta optimization goal" accent="purple" />
        <KpiCard label="Billing event" value={report.context.adSet.billingEvent} helper="Billing context" />
        <KpiCard label="Outbound clicks" value={formatMetric(report.metrics.outboundClicks)} metric={report.metrics.outboundClicks} helper="May be partially unavailable" />
      </section>

      <ChildPerformanceTable report={report} childType="ads" />
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
