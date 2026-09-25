"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Account = {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  timezone: string;
  accessStatus: string;
};

type Health = {
  ok: boolean;
  provider?: string;
  graphApiVersion?: string;
  health?: { status: string; adAccountCount?: number; user?: { name?: string } };
  error?: string;
};

type Freshness = {
  metaAccountId: string;
  connected: boolean;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastSyncStatus: string | null;
  dataThroughDate: string | null;
  errorState: { category: string; safeMessage: string; remediation: string } | null;
};

export function MetaIntegrationPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [freshness, setFreshness] = useState<Record<string, Freshness>>({});
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "health" | "discover" | "sync" | "freshness">("idle");
  const [error, setError] = useState<string | null>(null);

  async function testConnection() {
    setBusy("health");
    setError(null);
    try {
      const response = await fetch("/api/meta/health?live=true", { cache: "no-store" });
      const body = (await response.json()) as Health;
      setHealth(body);
      if (!body.ok) setError(body.error ?? "Meta connection check failed.");
    } catch {
      setError("Meta connection check failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function discoverAccounts() {
    setBusy("discover");
    setError(null);
    try {
      const response = await fetch("/api/meta/accounts", { cache: "no-store" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Account discovery failed.");
      setAccounts(body.accounts ?? []);
      await loadFreshness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account discovery failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function syncAccount(accountId: string) {
    setBusy("sync");
    setError(null);
    setSyncResult(null);
    try {
      const response = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, includeBreakdowns: false })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Account sync failed.");
      setSyncResult(
        body.queued
          ? `Sync queued for ${body.account?.name ?? accountId} (run ${body.runId}, ${body.totalChunks ?? 0} chunks). Track it under Sync operations.`
          : `Sync ${body.status} for ${body.account?.name ?? accountId}. Stages: ${body.stages?.length ?? 0}.`
      );
      await loadFreshness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account sync failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function loadFreshness() {
    setBusy("freshness");
    try {
      const response = await fetch("/api/meta/accounts/status", { cache: "no-store" });
      const body = await response.json();
      if (!body.ok) return;
      const map: Record<string, Freshness> = {};
      for (const entry of body.accounts ?? []) {
        map[entry.metaAccountId] = entry;
      }
      setFreshness(map);
    } catch {
      // Freshness is best-effort; the connection panel works without it.
    } finally {
      setBusy((current) => (current === "freshness" ? "idle" : current));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta integration</CardTitle>
        <CardDescription>Read-only connection verification. Secrets are never displayed in the browser.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={testConnection} disabled={busy !== "idle"}>
            {busy === "health" ? "Checking…" : "Test Connection"}
          </Button>
          <Button onClick={discoverAccounts} disabled={busy !== "idle"} variant="secondary">
            {busy === "discover" ? "Discovering…" : "Discover Ad Accounts"}
          </Button>
        </div>

        {health && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={health.ok ? "success" : "warning"}>{health.health?.status ?? (health.ok ? "ok" : "error")}</Badge>
            <span>Provider: {health.provider}</span>
            <span>API: {health.graphApiVersion}</span>
            {health.health?.user?.name && <span>User: {health.health.user.name}</span>}
            {typeof health.health?.adAccountCount === "number" && <span>Accounts: {health.health.adAccountCount}</span>}
          </div>
        )}

        {accounts.length > 0 && (
          <ul className="grid gap-2">
            {accounts.map((account) => {
              const state = freshness[account.id];
              return (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border dark:border-white/10 bg-muted/60 dark:bg-muted/40 p-3 text-sm">
                  <div>
                    <div className="font-medium">{account.name}</div>
                    <div className="text-muted-foreground">
                      {account.id} · {account.currency} · {account.timezone} · {account.accessStatus}
                    </div>
                    {state && (
                      <div className="text-muted-foreground">
                        Last sync: {state.lastSuccessfulSync ? `${state.lastSuccessfulSync.slice(0, 10)} (${state.lastSyncStatus})` : "never"}
                        {" · "}Data through: {state.dataThroughDate ?? "—"}
                        {state.errorState && (
                          <span className="text-red-700 dark:text-red-300"> · {state.errorState.category}: {state.errorState.remediation}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => syncAccount(account.id)} disabled={busy !== "idle"}>
                    {busy === "sync" ? "Syncing…" : "Sync Account"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {syncResult && <p className="text-sm text-emerald-700 dark:text-emerald-200">{syncResult}</p>}
        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
