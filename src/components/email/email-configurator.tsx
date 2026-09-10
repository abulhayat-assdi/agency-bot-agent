"use client";

import { useActionState } from "react";
import { CheckCircle2, MailCheck, Route, ShieldCheck } from "lucide-react";

import { saveEmailProviderConfigAction, saveEmailRoutingAction, type EmailConfigFormState } from "@/app/(dashboard)/email-reports/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailReportConfig } from "@/server/email";
import type { MetaAdAccount } from "@/server/meta";

const initialState: EmailConfigFormState = { status: "idle", message: "" };

function StatusMessage({ state }: { state: EmailConfigFormState }) {
  if (state.status === "idle") return null;
  return (
    <p className={state.status === "success" ? "text-sm text-emerald-700 dark:text-emerald-300" : "text-sm text-amber-700 dark:text-amber-300"}>
      {state.message}
    </p>
  );
}

export function EmailConfigurator({
  provider,
  providerConfigured,
  fromConfigured,
  reports,
  accounts
}: {
  provider: "mock" | "resend";
  providerConfigured: boolean;
  fromConfigured: boolean;
  reports: EmailReportConfig[];
  accounts: MetaAdAccount[];
}) {
  const [providerState, providerAction, providerPending] = useActionState(saveEmailProviderConfigAction, initialState);
  const [routingState, routingAction, routingPending] = useActionState(saveEmailRoutingAction, initialState);
  const firstReport = reports[0];
  const firstAccount = accounts[0];

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" aria-hidden="true" />Email provider</CardTitle>
          <CardDescription>Set sender and provider. Secrets stay outside Git.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={providerAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Provider
                <select name="provider" defaultValue={provider} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  <option value="mock">Mock preview</option>
                  <option value="resend">Resend</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Sender email
                <input name="fromEmail" type="email" defaultValue={fromConfigured ? "reports@example.com" : ""} placeholder="reports@yourdomain.com" className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium">
              API key status
              <select name="apiKeySet" defaultValue={providerConfigured ? "configured" : "missing"} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                <option value="configured">Configured in environment</option>
                <option value="missing">Not configured yet</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={providerPending}>{providerPending ? "Saving…" : "Save provider"}</Button>
              <Badge variant={providerConfigured ? "success" : "warning"}>{providerConfigured ? "Ready" : "Needs config"}</Badge>
            </div>
            <StatusMessage state={providerState} />
            <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />API keys are never shown or committed. Add live keys through deployment environment variables.</p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5 text-primary" aria-hidden="true" />Report routing</CardTitle>
          <CardDescription>Choose account, schedule, and recipient emails.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={routingAction} className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Report
                <select name="reportId" defaultValue={firstReport?.id} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  {reports.map((report) => <option key={report.id} value={report.id}>{report.name}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Ad account
                <select name="accountId" defaultValue={firstAccount?.id} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Cadence
                <select name="cadence" defaultValue={firstReport?.schedule.cadence ?? "weekly"} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Local time
                <input name="localTime" defaultValue={firstReport?.schedule.localTime ?? "09:00"} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium">
              Recipients
              <textarea name="recipients" defaultValue={firstReport?.recipients.map((recipient) => recipient.email).join(", ")} rows={3} className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={routingPending}>{routingPending ? "Saving…" : "Save routing"}</Button>
              <Badge variant="secondary">{reports.length} reports</Badge>
            </div>
            <StatusMessage state={routingState} />
            <p className="flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />Current milestone validates the configuration model; durable database editing can be enabled next.</p>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
