import Link from "next/link";
import { CalendarClock, CheckCircle2, Mail, Send, ShieldCheck, TriangleAlert } from "lucide-react";

import { formatMetric } from "@/components/dashboard/metric-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getEmailReportsDashboardData, nextDeliveryDescription } from "@/server/email";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function EmailReportsPage() {
  const data = await getEmailReportsDashboardData();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Scheduled reporting</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Email Reports</h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            Configure report schedules, recipients, delivery scope, and audit delivery history through a read-only analytics email layer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={data.providerConfigured ? "success" : "warning"}>{data.providerConfigured ? "Provider configured" : "Provider needs config"}</Badge>
          <Badge variant="secondary">{data.provider}</Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Configured reports</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><Mail className="h-5 w-5 text-sky-300" aria-hidden="true" />{data.reports.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Mock-backed schedules ready for DB persistence in a later hardening milestone.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Enabled schedules</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><CalendarClock className="h-5 w-5 text-emerald-300" aria-hidden="true" />{data.reports.filter((report) => report.enabled).length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Schedule times use each report/account timezone.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Recent deliveries</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><Send className="h-5 w-5 text-purple-300" aria-hidden="true" />{data.deliveryLogs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Delivery history keeps provider IDs and safe failure messages only.</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Report schedules</CardTitle>
          <CardDescription>Recipient and schedule configuration model for account, alert, and ad-level reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Name", "Type", "Status", "Recipients", "Schedule", "Dashboard", "Test send"]}
            rows={data.reports.map((report) => [
              report.name,
              label(report.reportType),
              <Badge key="status" variant={report.enabled ? "success" : "secondary"}>{report.enabled ? "Enabled" : "Paused"}</Badge>,
              report.recipients.filter((recipient) => recipient.status === "active").map((recipient) => recipient.email).join(", "),
              nextDeliveryDescription(report),
              <Button key="open" asChild size="sm" variant="outline"><Link href={report.dashboardPath}>Open</Link></Button>,
              <code key="api" className="rounded-lg bg-slate-950/80 px-2 py-1 text-xs text-sky-100">POST /api/email-reports/send</code>
            ])}
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Email content preview</CardTitle>
            <CardDescription>Rendered content is based on deterministic app analytics and preserves metric states.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.previews.map((preview) => (
              <div key={preview.reportId} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-100">{preview.subject}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{preview.dashboardPath}</p>
                  </div>
                  <Badge variant="secondary">Preview</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="text-muted-foreground">Spend</dt>
                    <dd className="mt-1 font-semibold">{formatMetric(preview.metrics.spend, { kind: "currency", currency: preview.currency })}</dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="text-muted-foreground">CTR</dt>
                    <dd className="mt-1 font-semibold">{formatMetric(preview.metrics.ctr, { kind: "percent" })}</dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="text-muted-foreground">Conversions</dt>
                    <dd className="mt-1 font-semibold">{formatMetric(preview.metrics.conversions)}</dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="text-muted-foreground">ROAS</dt>
                    <dd className="mt-1 font-semibold">{formatMetric(preview.metrics.roas, { kind: "ratio" })}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery history</CardTitle>
            <CardDescription>Safe delivery log view with no provider credentials or raw API payloads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.deliveryLogs.map((log) => (
              <div key={log.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{log.renderedSubject}</div>
                  <Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "warning" : "secondary"}>{log.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {log.recipientCount} recipient(s) · provider {log.provider} · {log.sentAt ?? log.createdAt}
                </p>
                {log.safeError ? (
                  <p className="mt-2 flex gap-2 text-xs text-amber-100/80"><TriangleAlert className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />{log.safeError}</p>
                ) : (
                  <p className="mt-2 flex gap-2 text-xs text-emerald-100/80"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />Delivery accepted by provider.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Safety and accuracy caveats</CardTitle>
          <CardDescription>Email reporting follows the same data accuracy rules as dashboards and AI.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.caveats.map((caveat) => (
            <div key={caveat} className="flex gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-50/85">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              {caveat}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
