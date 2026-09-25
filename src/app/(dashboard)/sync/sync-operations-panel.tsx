"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RunView = {
  runId: string;
  status: string;
  type: string;
  adAccountId: string | null;
  stale: boolean;
  staleRemediation: string | null;
  checkpoint: {
    metaAccountId?: string;
    syncKind?: string;
    requestedSince?: string;
    requestedUntil?: string;
    totalChunks?: number;
    completedChunks?: number;
    failedChunks?: Array<{ index: number; kind?: string; attempts: number }>;
    pendingChunks?: number;
    currentChunk?: number | null;
  } | null;
  stats: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
};

type RunError = {
  id: string;
  stage: string | null;
  chunkIndex: number | null;
  category: string;
  safeMessage: string;
  remediation: string;
  retryable: boolean;
  occurredAt: string;
};

export function SyncOperationsPanel({
  queueConfigured,
  initialRuns,
  accounts,
  databaseConfigured
}: {
  queueConfigured: boolean;
  initialRuns: RunView[];
  accounts: Array<{ metaAccountId: string; name: string }>;
  databaseConfigured: boolean;
}) {
  const [runs, setRuns] = useState<RunView[]>(initialRuns);
  const [selected, setSelected] = useState<{ run: RunView; errors: RunError[] } | null>(null);
  const [form, setForm] = useState({ accountId: accounts[0]?.metaAccountId ?? "", syncKind: "manual", dateStart: "", dateEnd: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      const response = await fetch("/api/meta/runs?limit=20", { cache: "no-store" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not load sync runs.");
      setRuns(body.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sync runs.");
    } finally {
      setBusy(null);
    }
  }

  async function inspect(runId: string) {
    setBusy(`inspect:${runId}`);
    setError(null);
    try {
      const response = await fetch(`/api/meta/runs/${runId}`, { cache: "no-store" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not load run detail.");
      setSelected({ run: body.run, errors: body.errors ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load run detail.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel(runId: string) {
    setBusy(`cancel:${runId}`);
    setError(null);
    try {
      const response = await fetch(`/api/meta/sync/${runId}/cancel`, { method: "POST" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not cancel run.");
      setMessage(`Run ${runId} cancelled. In-flight chunks finish cooperatively; no new chunks start.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel run.");
    } finally {
      setBusy(null);
    }
  }

  async function startSync() {
    if (!form.accountId) {
      setError("Select an ad account first.");
      return;
    }
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: form.accountId, includeBreakdowns: true })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not start sync.");
      setMessage(body.queued ? `Sync queued (run ${body.runId}, ${body.totalChunks ?? 0} chunks).` : `Sync finished inline with status ${body.status}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sync.");
    } finally {
      setBusy(null);
    }
  }

  async function startBackfill() {
    if (!form.accountId || !form.dateStart || !form.dateEnd) {
      setError("Select an account and a start/end date for backfill.");
      return;
    }
    setBusy("backfill");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/meta/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: form.accountId, dateStart: form.dateStart, dateEnd: form.dateEnd, syncKind: form.syncKind })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not start backfill.");
      setMessage(`Backfill queued (run ${body.runId}, ${body.totalChunks ?? 0} chunks). Completed chunks are skipped on resume.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start backfill.");
    } finally {
      setBusy(null);
    }
  }

  if (!databaseConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync operations unavailable</CardTitle>
          <CardDescription>Configure DATABASE_URL to persist sync runs and operate the production queue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start work</CardTitle>
          <CardDescription>Manual syncs chunk the range automatically; backfills resume from the last completed chunk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Ad account</span>
              <select
                className="rounded-xl border border-border dark:border-white/10 bg-white dark:bg-background p-2"
                value={form.accountId}
                onChange={(event) => setForm({ ...form, accountId: event.target.value })}
              >
                {accounts.map((account) => (
                  <option key={account.metaAccountId} value={account.metaAccountId}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Kind</span>
              <select
                className="rounded-xl border border-border dark:border-white/10 bg-white dark:bg-background p-2"
                value={form.syncKind}
                onChange={(event) => setForm({ ...form, syncKind: event.target.value })}
              >
                {["manual", "initial", "incremental", "backfill"].map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Backfill start</span>
              <input
                type="date"
                className="rounded-xl border border-border dark:border-white/10 bg-white dark:bg-background p-2"
                value={form.dateStart}
                onChange={(event) => setForm({ ...form, dateStart: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Backfill end</span>
              <input
                type="date"
                className="rounded-xl border border-border dark:border-white/10 bg-white dark:bg-background p-2"
                value={form.dateEnd}
                onChange={(event) => setForm({ ...form, dateEnd: event.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={startSync} disabled={busy !== null || !queueConfigured}>
              {busy === "sync" ? "Starting…" : "Start Sync"}
            </Button>
            <Button onClick={startBackfill} disabled={busy !== null || !queueConfigured} variant="secondary">
              {busy === "backfill" ? "Queueing…" : "Start Backfill"}
            </Button>
            <Button onClick={refresh} disabled={busy !== null} variant="secondary">
              {busy === "refresh" ? "Refreshing…" : "Refresh Status"}
            </Button>
          </div>
          {!queueConfigured && <p className="text-sm text-muted-foreground">Queue actions need REDIS_URL; run history below still reflects persisted runs.</p>}
          {message && <p className="text-sm text-emerald-700 dark:text-emerald-200">{message}</p>}
          {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sync runs</CardTitle>
          <CardDescription>Progress, checkpoints, and safe error categories. Select a run for stage detail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No sync runs yet. Start a sync above.</p>}
          {runs.map((run) => (
            <div key={run.runId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border dark:border-white/10 bg-muted/60 dark:bg-muted/40 p-3 text-sm">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <Badge variant={run.status === "success" ? "success" : "warning"}>{run.status}</Badge>
                  <span>{run.checkpoint?.metaAccountId ?? run.adAccountId ?? "account pending"}</span>
                  <span className="text-muted-foreground">{run.type}</span>
                </div>
                <div className="text-muted-foreground">
                  {run.checkpoint
                    ? `Chunks ${run.checkpoint.completedChunks ?? 0}/${run.checkpoint.totalChunks ?? 0} · range ${run.checkpoint.requestedSince}–${run.checkpoint.requestedUntil}`
                    : "Checkpoint pending"}
                  {run.durationMs !== null && run.durationMs !== undefined && ` · ${(run.durationMs / 1000).toFixed(1)}s`}
                </div>
                {run.errorSummary && <div className="text-red-700 dark:text-red-300">{run.errorSummary}</div>}
                {run.stale && (
                  <div className="text-amber-700 dark:text-amber-200">
                    Stale: active beyond the expected window. {run.staleRemediation ?? "Check worker logs and Redis connectivity."}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => inspect(run.runId)} disabled={busy !== null}>
                  {busy === `inspect:${run.runId}` ? "Loading…" : "Inspect"}
                </Button>
                {(run.status === "queued" || run.status === "running" || run.status === "partial") && (
                  <Button size="sm" variant="secondary" onClick={() => cancel(run.runId)} disabled={busy !== null}>
                    {busy === `cancel:${run.runId}` ? "Cancelling…" : "Cancel"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Run {selected.run.runId}</CardTitle>
            <CardDescription>
              Status {selected.run.status} · {selected.run.checkpoint?.syncKind ?? selected.run.type} ·{" "}
              {selected.run.checkpoint ? `${selected.run.checkpoint.requestedSince}–${selected.run.checkpoint.requestedUntil}` : "range pending"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {selected.run.checkpoint?.failedChunks && selected.run.checkpoint.failedChunks.length > 0 && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm">
                Failed chunks: {selected.run.checkpoint.failedChunks.map((entry) => `#${entry.index}${entry.kind ? ` (${entry.kind})` : ""}`).join(", ")} — resume
                re-runs only these.
              </div>
            )}
            {selected.errors.length === 0 && <p className="text-sm text-muted-foreground">No recorded errors for this run.</p>}
            {selected.errors.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-border dark:border-white/10 bg-muted/60 dark:bg-muted/40 p-3 text-sm">
                <div className="font-medium">
                  {entry.category}
                  {entry.chunkIndex !== null && entry.chunkIndex !== undefined && ` · chunk ${entry.chunkIndex}`}
                  {entry.stage && ` · ${entry.stage}`}
                </div>
                <div className="text-muted-foreground">{entry.safeMessage}</div>
                <div className="text-emerald-700 dark:text-emerald-200">{entry.remediation}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
