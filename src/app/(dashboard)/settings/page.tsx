import Link from "next/link";
import { KeyRound, PlugZap, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig, getRuntimeReadiness } from "@/server/config/env";
import { getEmailProviderReadiness } from "@/server/email";
import { getMetaProviderReadiness } from "@/server/meta";
import { getSyncQueueReadiness } from "@/server/jobs";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const config = getAppConfig();
  const runtime = getRuntimeReadiness(config);
  const meta = getMetaProviderReadiness();
  const email = getEmailProviderReadiness();
  const jobs = getSyncQueueReadiness();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Settings</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Configuration</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Provider readiness at a glance. Secrets are never displayed.</p>
        </div>
        <Badge variant={runtime.metaConfigured ? "success" : "warning"}>{meta.provider}</Badge>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Meta</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><PlugZap className="h-5 w-5 text-primary" aria-hidden="true" />{meta.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Version: {meta.graphApiVersion}</div>
            <div>Token: {meta.tokenConfigured ? "Set" : "Missing"}</div>
            <div>App secret: {meta.appSecretConfigured ? "Set" : "Missing"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Access</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />{meta.readOnlyPermission}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Read-only reporting. No ads_management required.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Jobs</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><PlugZap className="h-5 w-5 text-violet-500" aria-hidden="true" />{jobs.queueName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Redis: {jobs.configured ? "Ready" : "Missing"}</div>
            <div>Interval: {jobs.repeatableSyncIntervalMinutes}m</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Email</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-amber-500" aria-hidden="true" />{email.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>Provider: {email.configured ? "Ready" : "Needs config"}</div>
            <div>Sender: {email.fromConfigured ? "Set" : "Missing"}</div>
            <Button asChild size="sm" variant="outline"><Link href="/email-reports">Configure email</Link></Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Live Meta checklist</CardTitle>
          <CardDescription>Short rules for safe production setup.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            "Use META_PROVIDER=graph-api only with a read-only system user token.",
            "Request ads_read only for Phase 1 reporting.",
            "Keep Graph API v26.0 unless official docs change.",
            "Monitor throttle and account-usage headers.",
            "Use small windows for high-volume sync.",
            "Preserve unavailable metrics as states, never zeros."
          ].map((item) => (
            <div key={item} className="flex gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-800 dark:text-emerald-100/85">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
