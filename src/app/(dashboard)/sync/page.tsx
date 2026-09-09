import { Activity, CheckCircle2, Clock3, DatabaseZap, ShieldCheck, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig } from "@/server/config/env";
import { getSyncQueueReadiness } from "@/server/jobs";

export const dynamic = "force-dynamic";

const lifecycle = [
  "queued",
  "running",
  "success or partial",
  "failed with retry metadata"
];

const guarantees = [
  "BullMQ jobs use bounded exponential retries and retain recent completion/failure history for auditing.",
  "Workers call the read-only Meta provider interface only; no campaign, ad set, ad, budget, or creative mutation API exists in this milestone.",
  "Sync workers preserve unavailable/null/unsupported metric states instead of coercing missing provider data to zero.",
  "The queue is disabled safely until REDIS_URL is configured in the deployment environment."
];

export default function SyncOperationsPage() {
  const readiness = getSyncQueueReadiness();
  const config = getAppConfig();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">Milestone 10</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Redis and BullMQ sync operations</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Background job architecture for scheduled Meta ingestion, retry-safe queue processing, and worker/runtime health. Live database persistence
            and Graph API ingestion remain reserved for the read-only Meta integration milestone.
          </p>
        </div>
        <Badge variant={readiness.configured ? "success" : "secondary"}>{readiness.configured ? "Redis configured" : "Redis not configured"}</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Queue</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DatabaseZap className="h-5 w-5 text-sky-300" aria-hidden="true" />
              {readiness.queueName}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Dedicated queue for read-only Meta account sync work.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Worker concurrency</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-emerald-300" aria-hidden="true" />
              {readiness.workerConcurrency}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Conservative default for early provider-limit safety.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Retry policy</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TriangleAlert className="h-5 w-5 text-amber-300" aria-hidden="true" />
              {readiness.defaultAttempts} attempts
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Exponential backoff for retryable provider/transient failures.</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Schedule interval</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-5 w-5 text-purple-300" aria-hidden="true" />
              {config.SYNC_INTERVAL_MINUTES} min
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Configured via SYNC_INTERVAL_MINUTES for recurring account sync registration.</CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operational lifecycle</CardTitle>
            <CardDescription>Queue states are explicit so dashboards and future alerts can distinguish queued, running, partial, and failed work.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-2">
              {lifecycle.map((item, index) => (
                <li key={item} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/10 text-sm font-semibold text-sky-200">{index + 1}</span>
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
              <div key={item} className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-sm text-emerald-50/90">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Deployment commands</CardTitle>
          <CardDescription>Run these in a Redis-enabled environment. They intentionally fail fast when REDIS_URL is missing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <code className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sky-100">npm run jobs:schedule-sync</code>
          <code className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sky-100">npm run jobs:worker</code>
          <div className="flex items-center gap-2 text-muted-foreground md:col-span-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            API readiness endpoint: <code className="rounded bg-white/10 px-2 py-1 text-xs">/api/jobs/health</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
