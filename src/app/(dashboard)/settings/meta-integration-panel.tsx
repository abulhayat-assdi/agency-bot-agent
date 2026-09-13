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

export function MetaIntegrationPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "health" | "discover" | "sync">("idle");
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
      setSyncResult(`Sync ${body.status} for ${body.account?.name ?? accountId}. Stages: ${body.stages?.length ?? 0}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account sync failed.");
    } finally {
      setBusy("idle");
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
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm">
                <div>
                  <div className="font-medium">{account.name}</div>
                  <div className="text-muted-foreground">
                    {account.id} · {account.currency} · {account.timezone} · {account.accessStatus}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => syncAccount(account.id)} disabled={busy !== "idle"}>
                  {busy === "sync" ? "Syncing…" : "Sync Account"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {syncResult && <p className="text-sm text-emerald-200">{syncResult}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
