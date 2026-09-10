import Link from "next/link";
import { CalendarClock, CheckCircle2, Mail, Send, TriangleAlert } from "lucide-react";

import { EmailConfigurator } from "@/components/email/email-configurator";
import { formatMetric } from "@/components/dashboard/metric-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricsTable } from "@/components/tables/metrics-table";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";
import { getEmailProviderReadiness, getEmailReportsDashboardData, nextDeliveryDescription } from "@/server/email";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function EmailReportsPage() {
  const [data, dashboardData] = await Promise.all([getEmailReportsDashboardData(), getDashboardData({ preset: "last_7_days" })]);
  const readiness = getEmailProviderReadiness();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Email Reports</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Schedule and routing</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Configure sender, recipients, account scope, and report cadence.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={data.providerConfigured ? "success" : "warning"}>{data.providerConfigured ? "Ready" : "Needs config"}</Badge>
          <Badge variant="secondary">{data.provider}</Badge>
        </div>
      </section>

      <EmailConfigurator provider={data.provider} providerConfigured={data.providerConfigured} fromConfigured={readiness.fromConfigured} reports={data.reports} accounts={dashboardData.accounts} />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Reports</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><Mail className="h-5 w-5 text-primary" aria-hidden="true" />{data.reports.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Configurable report templates.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Active</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><CalendarClock className="h-5 w-5 text-emerald-500" aria-hidden="true" />{data.reports.filter((report) => report.enabled).length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Timezone-aware schedules.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Deliveries</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl"><Send className="h-5 w-5 text-violet-500" aria-hidden="true" />{data.deliveryLogs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Safe provider logs.</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Routing matrix</CardTitle>
          <CardDescription>Which report goes to which email list.</CardDescription>
        </CardHeader>
        <CardContent>
          <MetricsTable
            columns={["Report", "Type", "Status", "Recipients", "Schedule", "Dashboard", "Test send"]}
            rows={data.reports.map((report) => [
              report.name,
              label(report.reportType),
              <Badge key="status" variant={report.enabled ? "success" : "secondary"}>{report.enabled ? "Enabled" : "Paused"}</Badge>,
              report.recipients.filter((recipient) => recipient.status === "active").map((recipient) => recipient.email).join(", "),
              nextDeliveryDescription(report),
              <Button key="open" asChild size="sm" variant="outline"><Link href={report.dashboardPath}>Open</Link></Button>,
              <code key="api" className="rounded-lg bg-muted px-2 py-1 text-xs text-foreground">POST /api/email-reports/send</code>
            ])}
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Email preview</CardTitle>
            <CardDescription>Key metrics only, with metric states preserved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.previews.slice(0, 2).map((preview) => (
              <div key={preview.reportId} className="metric-surface rounded-3xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{preview.subject}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{preview.dashboardPath}</p>
                  </div>
                  <Badge variant="secondary">Preview</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  {[
                    ["Spend", formatMetric(preview.metrics.spend, { kind: "currency", currency: preview.currency })],
                    ["CTR", formatMetric(preview.metrics.ctr, { kind: "percent" })],
                    ["Conv.", formatMetric(preview.metrics.conversions)],
                    ["ROAS", formatMetric(preview.metrics.roas, { kind: "ratio" })]
                  ].map(([name, value]) => (
                    <div key={name} className="rounded-2xl border border-border/80 bg-card/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="mt-1 font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery history</CardTitle>
            <CardDescription>No secrets or raw provider payloads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.deliveryLogs.map((log) => (
              <div key={log.id} className="metric-surface rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{log.renderedSubject}</div>
                  <Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "warning" : "secondary"}>{log.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{log.recipientCount} recipients · {log.provider} · {log.sentAt ?? log.createdAt}</p>
                {log.safeError ? (
                  <p className="mt-2 flex gap-2 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{log.safeError}</p>
                ) : (
                  <p className="mt-2 flex gap-2 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Provider accepted.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
