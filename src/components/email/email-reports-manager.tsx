"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailReportConfig } from "@/server/email/types";
import type { MetaAdAccount } from "@/server/meta";

type ManagerProps = {
  initialReports: EmailReportConfig[];
  accounts: MetaAdAccount[];
};

type Feedback = { kind: "success" | "error"; message: string } | null;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return body;
}

export function EmailReportsManager({ initialReports, accounts }: ManagerProps) {
  const [reports, setReports] = useState<EmailReportConfig[]>(initialReports);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    accountId: accounts[0]?.id ?? "",
    reportType: "account_summary",
    cadence: "weekly",
    localTime: "09:00",
    timezone: accounts[0]?.timezone ?? "UTC",
    recipients: "",
    includeAiSummary: true
  });
  const [recipientInputs, setRecipientInputs] = useState<Record<string, string>>({});

  async function refresh() {
    const body = await api("/api/email-reports");
    setReports(body.reports ?? []);
  }

  async function run(label: string, task: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await task();
      await refresh();
      setFeedback({ kind: "success", message: `${label}: ${successMessage}` });
    } catch (error) {
      setFeedback({ kind: "error", message: `${label} failed: ${error instanceof Error ? error.message : "unknown error"}` });
    } finally {
      setBusy(false);
    }
  }

  async function createReport(event: React.FormEvent) {
    event.preventDefault();
    const recipients = form.recipients
      .split(/[\n,]+/)
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    await run("Create report", async () => {
      await api("/api/email-reports", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          accountId: form.accountId,
          reportType: form.reportType,
          schedule: {
            cadence: form.cadence,
            localTime: form.localTime,
            timezone: form.timezone,
            datePreset: "last_7_days",
            includeAiSummary: form.includeAiSummary
          },
          timezone: form.timezone,
          recipients
        })
      });
      setForm({ ...form, name: "", recipients: "" });
    }, "report created and scheduled");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Create, enable, send, and remove persisted reports. Recipients are managed per report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback ? (
            <p role={feedback.kind === "error" ? "alert" : "status"} className={feedback.kind === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}>
              {feedback.message}
            </p>
          ) : null}
          {reports.length === 0 ? <p className="text-sm text-muted-foreground">No persisted reports yet. Create the first one below.</p> : null}
          {reports.map((report) => (
            <div key={report.id} className="rounded-3xl border border-border/80 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{report.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.accountId ?? "no account"} · {report.schedule.cadence} at {report.schedule.localTime} ({report.schedule.timezone})
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={report.enabled ? "success" : "secondary"}>{report.enabled ? "Enabled" : "Paused"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(report.name, () => api(`/api/email-reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !report.enabled }) }), report.enabled ? "paused" : "enabled")
                    }
                  >
                    {report.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(report.name, () => api("/api/email-reports/send", { method: "POST", body: JSON.stringify({ reportId: report.id }) }), "send requested")}
                  >
                    Send now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(report.name, () => api(`/api/email-reports/${report.id}`, { method: "DELETE" }), "removed")}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipients ({report.recipients.filter((r) => r.status === "active").length} active)</p>
                <ul className="space-y-1 text-sm">
                  {report.recipients.map((recipient) => (
                    <li key={recipient.email} className="flex items-center justify-between gap-2">
                      <span>
                        {recipient.email} <span className="text-xs text-muted-foreground">({recipient.status})</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(
                            "Remove recipient",
                            async () => {
                              const list = await api(`/api/email-reports/${report.id}/recipients`);
                              const match = (list.recipients as Array<{ id: string; email: string }>).find((row) => row.email === recipient.email);
                              if (!match) throw new Error("Recipient not found");
                              await api(`/api/email-reports/${report.id}/recipients/${match.id}`, { method: "DELETE" });
                            },
                            `${recipient.email} removed`
                          )
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const email = (recipientInputs[report.id] ?? "").trim();
                    if (!email) return;
                    void run("Add recipient", () =>
                      api(`/api/email-reports/${report.id}/recipients`, { method: "POST", body: JSON.stringify({ email }) }).then(() =>
                        setRecipientInputs((inputs) => ({ ...inputs, [report.id]: "" }))
                      ), `${email} added`);
                  }}
                >
                  <input
                    type="email"
                    required
                    placeholder="teammate@example.com"
                    value={recipientInputs[report.id] ?? ""}
                    onChange={(event) => setRecipientInputs((inputs) => ({ ...inputs, [report.id]: event.target.value }))}
                    className="h-9 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
                  />
                  <Button size="sm" type="submit" disabled={busy}>
                    Add
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create report</CardTitle>
          <CardDescription>Stored in PostgreSQL with timezone-aware scheduling.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createReport} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Name
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Ad account
              <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Report type
              <select value={form.reportType} onChange={(event) => setForm({ ...form, reportType: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                {["account_summary", "campaign_report", "adset_report", "ad_report", "ai_summary", "performance_alerts"].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Cadence
              <select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Local time
              <input value={form.localTime} onChange={(event) => setForm({ ...form, localTime: event.target.value })} pattern="^([01]\d|2[0-3]):[0-5]\d$" className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Timezone
              <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
            </label>
            <label className="space-y-2 text-sm font-medium md:col-span-2">
              Recipients (comma or newline separated)
              <textarea value={form.recipients} onChange={(event) => setForm({ ...form, recipients: event.target.value })} rows={2} className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={form.includeAiSummary} onChange={(event) => setForm({ ...form, includeAiSummary: event.target.checked })} />
              Include grounded AI summary
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy || !form.name || !form.accountId}>
                {busy ? "Working…" : "Create report"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
