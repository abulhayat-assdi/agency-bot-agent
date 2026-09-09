import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DateRangePreset } from "@/lib/dates/reporting";
import type { ComparisonMetricKey, TrendDashboardData } from "@/server/trends";

const presets: Array<{ key: DateRangePreset; label: string }> = [
  { key: "last_7_days", label: "Last 7 Days" },
  { key: "last_14_days", label: "Last 14 Days" },
  { key: "last_28_days", label: "Last 28 Days" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" }
];

const levels = ["campaign", "adset", "ad"] as const;
const metrics: Array<{ key: ComparisonMetricKey; label: string }> = [
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "conversions", label: "Conversions" },
  { key: "spend", label: "Spend" }
];

function href(values: { accountId: string; preset: string; entityLevel: string; metricKey: string }) {
  return `/trends?accountId=${encodeURIComponent(values.accountId)}&preset=${values.preset}&entityLevel=${values.entityLevel}&metricKey=${values.metricKey}`;
}

export function TrendControls({ data, preset }: { data: TrendDashboardData; preset: DateRangePreset }) {
  return (
    <div className="glass-panel rounded-3xl p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Account</Badge>
        {data.accounts.map((account) => (
          <Button key={account.id} asChild size="sm" variant={account.id === data.selectedAccount.id ? "default" : "ghost"}>
            <Link href={href({ accountId: account.id, preset, entityLevel: data.entityLevel, metricKey: data.metricKey })}>{account.name}</Link>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Date range</Badge>
        {presets.map((item) => (
          <Button key={item.key} asChild size="sm" variant={item.key === preset ? "default" : "ghost"}>
            <Link href={href({ accountId: data.selectedAccount.id, preset: item.key, entityLevel: data.entityLevel, metricKey: data.metricKey })}>{item.label}</Link>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Compare</Badge>
        {levels.map((level) => (
          <Button key={level} asChild size="sm" variant={level === data.entityLevel ? "default" : "ghost"}>
            <Link href={href({ accountId: data.selectedAccount.id, preset, entityLevel: level, metricKey: data.metricKey })}>{level}</Link>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Rank metric</Badge>
        {metrics.map((metric) => (
          <Button key={metric.key} asChild size="sm" variant={metric.key === data.metricKey ? "default" : "ghost"}>
            <Link href={href({ accountId: data.selectedAccount.id, preset, entityLevel: data.entityLevel, metricKey: metric.key })}>{metric.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
