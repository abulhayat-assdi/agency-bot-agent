import { KeyRound, PlugZap, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Agency configuration</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Settings</h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            Runtime readiness and provider configuration status. Secrets are shown only as boolean configuration flags.
          </p>
        </div>
        <Badge variant={runtime.metaConfigured ? "success" : "warning"}>{meta.provider}</Badge>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Meta provider</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><PlugZap className="h-5 w-5 text-sky-300" aria-hidden="true" />{meta.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Graph API version: {meta.graphApiVersion}</div>
            <div>Token configured: {meta.tokenConfigured ? "Yes" : "No"}</div>
            <div>App secret configured: {meta.appSecretConfigured ? "Yes" : "No"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Required permission</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />{meta.readOnlyPermission}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">No ads_management or write capability is required or requested in Phase 1.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Jobs</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><PlugZap className="h-5 w-5 text-purple-300" aria-hidden="true" />{jobs.queueName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Redis configured: {jobs.configured ? "Yes" : "No"}</div>
            <div>Sync interval: {jobs.repeatableSyncIntervalMinutes} minutes</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Email</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-amber-300" aria-hidden="true" />{email.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Provider configured: {email.configured ? "Yes" : "No"}</div>
            <div>From configured: {email.fromConfigured ? "Yes" : "No"}</div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Live Meta integration checklist</CardTitle>
          <CardDescription>Use manual Business Partner/System User access now, with structure compatible with future OAuth.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            "Set META_PROVIDER=graph-api only in a secure environment with a read-only system user access token.",
            "Use ads_read for performance reporting. Do not request ads_management for Phase 1 dashboards.",
            "Use v26.0 by default unless Meta deprecates or updates official Graph API versioning.",
            "Monitor x-fb-ads-insights-throttle and x-ad-account-usage headers in sync logs.",
            "Keep query windows small and use async/batch strategies for high-volume future ingestion.",
            "Preserve unavailable fields and action attribution limitations as data states, never zeros."
          ].map((item) => (
            <div key={item} className="flex gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-50/85">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
