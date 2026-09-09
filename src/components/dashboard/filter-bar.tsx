import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardClient } from "@/server/dashboard/mock-dashboard-data";
import type { MetaAdAccount } from "@/server/meta";
import type { DateRangePreset } from "@/lib/dates/reporting";

const presets: Array<{ key: DateRangePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_3_days", label: "Last 3 Days" },
  { key: "last_7_days", label: "Last 7 Days" },
  { key: "last_14_days", label: "Last 14 Days" },
  { key: "last_28_days", label: "Last 28 Days" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" }
];

function href(params: Record<string, string | undefined>) {
  const url = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.set(key, value);
  });
  const query = url.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function FilterBar({
  preset,
  clientId,
  accountId,
  clients,
  accounts
}: {
  preset: DateRangePreset;
  clientId?: string;
  accountId?: string;
  clients: DashboardClient[];
  accounts: MetaAdAccount[];
}) {
  const visibleAccounts = clientId ? accounts.filter((account) => clients.find((client) => client.id === clientId)?.accountIds.includes(account.id)) : accounts;

  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Date range</Badge>
        {presets.map((item) => (
          <Button key={item.key} asChild size="sm" variant={item.key === preset ? "default" : "ghost"}>
            <Link href={href({ preset: item.key, clientId, accountId })}>{item.label}</Link>
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Client</Badge>
        <Button asChild size="sm" variant={!clientId ? "default" : "ghost"}>
          <Link href={href({ preset })}>All clients</Link>
        </Button>
        {clients.map((client) => (
          <Button key={client.id} asChild size="sm" variant={client.id === clientId ? "default" : "ghost"}>
            <Link href={href({ preset, clientId: client.id })}>{client.name}</Link>
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Account</Badge>
        <Button asChild size="sm" variant={!accountId ? "default" : "ghost"}>
          <Link href={href({ preset, clientId })}>All accounts</Link>
        </Button>
        {visibleAccounts.map((account) => (
          <Button key={account.id} asChild size="sm" variant={account.id === accountId ? "default" : "ghost"}>
            <Link href={href({ preset, clientId, accountId: account.id })}>{account.name}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
