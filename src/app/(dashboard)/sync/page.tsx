import { Activity, Clock3, DatabaseZap, ShieldCheck, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig } from "@/server/config/env";
import { getDatabase } from "@/server/db/client";
import { getSyncQueueReadiness } from "@/server/jobs";
import { SyncRepository } from "@/server/repositories/sync-repository";
import { accountFreshnessList, runProgressView } from "@/server/sync/run-service";
import { SyncOperationsPanel } from "@/app/(dashboard)/sync/sync-operations-panel";

export const dynamic = "force-dynamic";

const lifecycle = ["queued", "running", "success or partial", "failed with retry metadata"];

const guarantees = [
  "Chunked BullMQ jobs persist through runPersistedSync; completed chunks are never repeated on resume.",
  "Permanent Meta failures (auth, permission, invalid request, unsupported breakdown) fail fast without burning retries.",
  "Rate limits and transient failures retry with bounded exponential backoff and adaptive pacing.",
  "Sync workers preserve unavailable/null/unsupported metric states instead of coercing missing provider data to zero."
];

async function loadOperationsData() {
  try {
    const db = getDatabase();
    const agencies = await db.query.agencies.findMany({ limit: 1 });
    if (!agencies[0]) return null;
    const agencyId = agencies[0].id;
    const sync = new SyncRepository({ db, agencyId });
    const runs = await sync.latestRuns(null, 20);
    const accounts = await accountFreshnessList(db, agencyId);
    return {
      runs: runs.map((run) =>
        runProgressView({
          id: run.id,
          status: run.status,
          type: run.type,
          adAccountId: run.adAccountId,
          checkpoint: run.checkpoint,
          stats: run.stats,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          createdAt: run.createdAt,
          errorSummary: run.errorSummary
        })
      ),
      accounts: accounts.map((entry) => ({ metaAccountId: entry.metaAccountId, name: entry.name }))
    };
  } catch {
    return null;
  }
}

export default async function SyncOperationsPage() {
  const readiness = getSyncQueueReadiness();
  const config = getAppConfig();
  const data = await loadOperationsData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border/80 bg-card/80 dark:border-white/10 dark:bg-card p-6 shadow-2xl shadow-slate-950/40 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">Sync operations</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Production sync engine</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Chunked BullMQ backfills with checkpoint resume, adaptive pacing, persisted stage tracking, and per-account freshness. Queue depth is bounded
            by META_SYNC_CONCURRENCY={config.META_SYNC_CONCURRENCY}; backfill chunks default to {config.BACKFILL_CHUNK_DAYS} days.
          </p>
        </div>
        <Badge variant={readiness.configured ? "success" : "secondary"}>{readiness.configured ? "Redis configured" : "Redis not configured"}</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Queue</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DatabaseZap className="h-5 w-5 text-primary" aria-hidden="true" />
              {readiness.queueName}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Chunk + planner jobs for read-only Meta account sync work.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Worker concurrency</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              {readiness.workerConcurrency}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Configured via META_SYNC_CONCURRENCY; chunks interleave fairly across accounts.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Retry policy</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              {readiness.defaultAttempts} attempts
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Retryable failures only; permanent Meta errors fail fast via UnrecoverableError.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Schedule interval</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-5 w-5 text-purple-600 dark:text-purple-300" aria-hidden="true" />
              {config.SYNC_INTERVAL_MINUTES} min
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Incremental schedule re-reads today plus {config.META_INCREMENTAL_LOOKBACK_DAYS}-day lookback.</CardContent>
        </Card>
      </section>

      <SyncOperationsPanel
        queueConfigured={readiness.configured}
        initialRuns={data?.runs ?? []}
        accounts={data?.accounts ?? []}
        databaseConfigured={data !== null}
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operational lifecycle</CardTitle>
            <CardDescription>Queue states are explicit so dashboards and alerts can distinguish queued, running, partial, and failed work.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-2">
              {lifecycle.map((item, index) => (
                <li key={item} className="rounded-2xl metric-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary dark:text-primary">{index + 1}</span>
                    <span className="text-sm font-medium capitalize">{item}</span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Read-only guarantees</CardTitle>
            <CardDescription>Background processing follows the same Phase 1 accuracy and safety constraints as the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {guarantees.map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-sm text-emerald-900 dark:text-emerald-50/90">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
