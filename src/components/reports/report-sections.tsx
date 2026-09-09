import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, DatabaseZap } from "lucide-react";

import { formatMetric } from "@/components/dashboard/metric-format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import type { ReportData } from "@/server/reports/mock-report-data";
import { compareMetric } from "@/server/analytics";

export function PeriodComparisonCard({ report }: { report: ReportData }) {
  const metrics = ["spend", "ctr", "cpc", "cpa", "conversionRate", "roas"] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Period comparison</CardTitle>
        <CardDescription>Current period vs previous equivalent period.</CardDescription>
      </CardHeader>
      <CardContent>
        <MetricsTable
          columns={["Metric", "Current", "Previous", "Abs. change", "% change", "Direction"]}
          rows={metrics.map((key) => {
            const comparison = compareMetric(report.metrics[key], report.previousMetrics[key]);
            const isMoney = ["spend", "cpc", "cpa"].includes(key);
            const isPercent = ["ctr", "conversionRate"].includes(key);
            return [
              key.replaceAll(/([A-Z])/g, " $1").toUpperCase(),
              formatMetric(report.metrics[key], { kind: isMoney ? "currency" : isPercent ? "percent" : "ratio", currency: report.context.account.currency }),
              formatMetric(report.previousMetrics[key], { kind: isMoney ? "currency" : isPercent ? "percent" : "ratio", currency: report.context.account.currency }),
              formatMetric(comparison.absoluteChange, { kind: isMoney ? "currency" : isPercent ? "percent" : "ratio", currency: report.context.account.currency }),
              formatMetric(comparison.percentageChange, { kind: "percent" }),
              comparison.direction
            ];
          })}
        />
      </CardContent>
    </Card>
  );
}

export function TrendTable({ report }: { report: ReportData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily trend</CardTitle>
        <CardDescription>Daily metrics use the ad account timezone: {report.context.account.timezone}.</CardDescription>
      </CardHeader>
      <CardContent>
        <MetricsTable
          columns={["Date", "Spend", "Impressions", "Clicks", "Conversions"]}
          rows={report.trend.map((point) => [
            point.date,
            formatMetric({ value: point.spend, state: point.spend === 0 ? "actual_zero" : "available", source: "derived" }, { kind: "currency", currency: report.context.account.currency }),
            formatMetric({ value: point.impressions, state: point.impressions === 0 ? "actual_zero" : "available", source: "derived" }),
            formatMetric({ value: point.clicks, state: point.clicks === 0 ? "actual_zero" : "available", source: "derived" }),
            formatMetric({ value: point.conversions, state: point.conversions === 0 ? "actual_zero" : "available", source: "derived" })
          ])}
        />
      </CardContent>
    </Card>
  );
}

export function ChildPerformanceTable({ report, childType }: { report: ReportData; childType: "adsets" | "ads" }) {
  const hrefPrefix = childType === "adsets" ? "/adsets" : "/ads";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{childType === "adsets" ? "Child ad sets" : "Child ads"}</CardTitle>
        <CardDescription>Drill down through the reporting hierarchy without losing context.</CardDescription>
      </CardHeader>
      <CardContent>
        <MetricsTable
          columns={["Name", "Status", "Context", "Spend", "Impressions", "CTR", "Conversions", "ROAS", "Open"]}
          rows={report.children.map((child) => [
            child.name,
            <Badge key="status" variant={child.status === "ACTIVE" ? "success" : "secondary"}>{child.status}</Badge>,
            child.secondary ?? "—",
            formatMetric(child.metrics.spend, { kind: "currency", currency: report.context.account.currency }),
            formatMetric(child.metrics.impressions),
            formatMetric(child.metrics.ctr, { kind: "percent" }),
            formatMetric(child.metrics.conversions),
            formatMetric(child.metrics.roas, { kind: "ratio" }),
            <Button key="open" asChild size="sm" variant="outline"><Link href={`${hrefPrefix}/${child.id}`}>Open</Link></Button>
          ])}
        />
      </CardContent>
    </Card>
  );
}

export function BreakdownPreviewSections({ report }: { report: ReportData }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {report.breakdowns.map((breakdown) => (
        <Card key={breakdown.key}>
          <CardHeader>
            <CardTitle>{breakdown.label}</CardTitle>
            <CardDescription>{breakdown.limitation ?? "Preview breakdown generated from the mock Meta provider."}</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsTable
              columns={["Segment", "Spend", "Impressions", "Clicks", "CTR", "Conv.", "CPA", "ROAS"]}
              rows={breakdown.rows.slice(0, 10).map((row) => [
                row.label,
                formatMetric(row.metrics.spend, { kind: "currency", currency: report.context.account.currency }),
                formatMetric(row.metrics.impressions),
                formatMetric(row.metrics.clicks),
                formatMetric(row.metrics.ctr, { kind: "percent" }),
                formatMetric(row.metrics.conversions),
                formatMetric(row.metrics.cpa, { kind: "currency", currency: report.context.account.currency }),
                formatMetric(row.metrics.roas, { kind: "ratio" })
              ])}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DataHealthCard({ report }: { report: ReportData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data health and caveats</CardTitle>
        <CardDescription>Sufficiency: {report.sufficiency.state.replaceAll("_", " ")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.caveats.map((caveat) => (
          <div key={caveat} className="flex gap-2 text-sm text-muted-foreground">
            <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
            {caveat}
          </div>
        ))}
        {report.sufficiency.reasons.map((reason) => (
          <div key={reason} className="flex gap-2 text-sm text-amber-100/80">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            {reason}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AnomalyCard({ report }: { report: ReportData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deterministic anomalies</CardTitle>
        <CardDescription>AI may explain these later, but does not create them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.anomalies.length ? (
          report.anomalies.map((anomaly) => (
            <div key={anomaly.type} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {anomaly.type.replaceAll("_", " ")} · {anomaly.severity}
              </div>
              <p className="mt-1 text-xs text-amber-100/75">{anomaly.explanation}</p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100/80">
            <div className="flex items-center gap-2 font-semibold text-emerald-100">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              No threshold anomalies detected
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyzeAdCard({ report }: { report: ReportData }) {
  const adName = report.context.ad?.name ?? "selected ad";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyze This Ad</CardTitle>
        <CardDescription>Only the selected ad verified mock analytics context will be sent to AI when Milestone 10 is implemented.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled className="w-full">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Analyze {adName} — AI milestone pending
        </Button>
      </CardContent>
    </Card>
  );
}
