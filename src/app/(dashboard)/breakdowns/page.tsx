import Link from "next/link";
import { AlertTriangle, Clock3, DatabaseZap, ShieldCheck } from "lucide-react";

import { BreakdownBarChart } from "@/components/breakdowns/breakdown-bar-chart";
import { CapabilityGrid } from "@/components/breakdowns/capability-grid";
import { formatMetric } from "@/components/dashboard/metric-format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getBreakdownDashboardData } from "@/server/breakdowns";
import type { DateRangePreset } from "@/lib/dates/reporting";
import { formatDateRange } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const presets: Array<{ key: DateRangePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_3_days", label: "Last 3 Days" },
  { key: "last_7_days", label: "Last 7 Days" },
  { key: "last_14_days", label: "Last 14 Days" },
  { key: "last_28_days", label: "Last 28 Days" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" }
];

function readParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function href(values: { accountId?: string; preset?: string; breakdownKey?: string }) {
  const params = new URLSearchParams();
  if (values.accountId) params.set("accountId", values.accountId);
  if (values.preset) params.set("preset", values.preset);
  if (values.breakdownKey) params.set("breakdownKey", values.breakdownKey);
  return `/breakdowns?${params.toString()}`;
}

export default async function BreakdownsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const preset = (readParam(params, "preset") as DateRangePreset | undefined) ?? "last_7_days";
  const accountId = readParam(params, "accountId");
  const breakdownKey = readParam(params, "breakdownKey");
  const data = await getBreakdownDashboardData({ accountId, preset, breakdownKey });
  const topRow = data.rows[0];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Breakdown Analytics</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Audience, placement, device, geo, and time analysis</h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            {data.selectedCapability.label} · {formatDateRange(data.range)} · {data.selectedAccount.name} · {data.selectedAccount.currency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Metadata-driven capability rules</Badge>
          <Badge variant="secondary">{data.level} level</Badge>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>Invalid or conditional breakdown combinations are disabled before queries are sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Account</Badge>
            {data.accounts.map((account) => (
              <Button key={account.id} asChild size="sm" variant={account.id === data.selectedAccount.id ? "default" : "ghost"}>
                <Link href={href({ accountId: account.id, preset, breakdownKey: data.selectedCapability.key })}>{account.name}</Link>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Date range</Badge>
            {presets.map((item) => (
              <Button key={item.key} asChild size="sm" variant={item.key === preset ? "default" : "ghost"}>
                <Link href={href({ accountId: data.selectedAccount.id, preset: item.key, breakdownKey: data.selectedCapability.key })}>{item.label}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Segments" value={String(data.rows.length)} helper="Rows returned after grouping breakdown values" accent="purple" />
        <KpiCard label="Top segment" value={topRow?.label ?? "Unavailable"} helper="Ranked by spend in selected breakdown" />
        <KpiCard label="Top segment spend" value={formatMetric(topRow?.metrics.spend, { kind: "currency", currency: data.selectedAccount.currency })} metric={topRow?.metrics.spend} accent="amber" />
        <KpiCard label="Top segment ROAS" value={formatMetric(topRow?.metrics.roas, { kind: "ratio" })} metric={topRow?.metrics.roas} accent="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>{data.selectedCapability.label} performance</CardTitle>
            <CardDescription>Spend, clicks, and conversions for the top returned categories.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownBarChart rows={data.rows} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capability notes</CardTitle>
            <CardDescription>Current Meta and mock-mode limitations for this breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.selectedCapability.notes.map((note) => (
              <div key={note} className="flex gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {note}
              </div>
            ))}
            {data.selectedCapability.metricLimitations.map((note) => (
              <div key={note} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                {note}
              </div>
            ))}
            <div className="rounded-2xl metric-surface p-3 text-xs text-muted-foreground">
              Incompatible fields: {data.selectedCapability.incompatibleFields.join(", ")}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Breakdown table</CardTitle>
          <CardDescription>Metrics are derived from grouped provider rows; unavailable states are retained.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Segment", "Spend", "Impressions", "Reach", "Clicks", "CTR", "CPC", "Conversions", "CPA", "Value", "ROAS", "Availability"]}
            rows={data.rows.map((row) => [
              row.label,
              formatMetric(row.metrics.spend, { kind: "currency", currency: data.selectedAccount.currency }),
              formatMetric(row.metrics.impressions),
              formatMetric(row.metrics.reach),
              formatMetric(row.metrics.clicks),
              formatMetric(row.metrics.ctr, { kind: "percent" }),
              formatMetric(row.metrics.cpc, { kind: "currency", currency: data.selectedAccount.currency }),
              formatMetric(row.metrics.conversions),
              formatMetric(row.metrics.cpa, { kind: "currency", currency: data.selectedAccount.currency }),
              formatMetric(row.metrics.conversionValue, { kind: "currency", currency: data.selectedAccount.currency }),
              formatMetric(row.metrics.roas, { kind: "ratio" }),
              row.availabilitySummary.length ? row.availabilitySummary.join("; ") : "available"
            ])}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <p className="section-eyebrow">Capability matrix</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight">Supported and conditional breakdowns</h3>
        </div>
        <CapabilityGrid capabilities={data.capabilities} selectedKey={data.selectedCapability.key} selectedAccount={data.selectedAccount} preset={preset} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Disabled combinations</CardTitle>
            <CardDescription>Known-invalid or conditional requests are not sent by the UI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.unsupportedExamples.map((example) => (
              <div key={example.key} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm">
                <div className="font-semibold text-amber-800 dark:text-amber-100">{example.label}</div>
                <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{example.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data caveats</CardTitle>
            <CardDescription>Accuracy notes for breakdown analytics.</CardDescription>
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
              Hourly values are labeled in the selected account context and never use browser timezone.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
