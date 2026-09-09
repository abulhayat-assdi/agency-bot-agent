import { Button } from "@/components/ui/button";
import type { DateRangePreset } from "@/lib/dates/reporting";
import type { MetaAdAccount } from "@/server/meta";

const presets: Array<{ value: DateRangePreset; label: string }> = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_14_days", label: "Last 14 days" },
  { value: "last_28_days", label: "Last 28 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" }
];

export function AiControls({ accounts, defaultQuestion, selectedAccountId, selectedPreset }: { accounts: MetaAdAccount[]; defaultQuestion: string; selectedAccountId?: string; selectedPreset: DateRangePreset }) {
  return (
    <form className="grid gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-4 lg:grid-cols-[1fr_180px_180px_auto]" action="/ai-analyst">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Question</span>
        <input
          name="q"
          defaultValue={defaultQuestion}
          className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-sm outline-none ring-sky-400/30 transition focus:ring-2"
          placeholder="Ask about performance, top campaigns, anomalies, or data availability"
        />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account</span>
        <select name="accountId" defaultValue={selectedAccountId ?? accounts[0]?.id} className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-sm outline-none ring-sky-400/30 transition focus:ring-2">
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Date range</span>
        <select name="preset" defaultValue={selectedPreset} className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-sm outline-none ring-sky-400/30 transition focus:ring-2">
          {presets.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" className="h-11 w-full">Ask analyst</Button>
      </div>
    </form>
  );
}
