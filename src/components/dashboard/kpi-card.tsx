import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MetricValue } from "@/server/analytics";
import { stateLabel } from "@/components/dashboard/metric-format";

interface KpiCardProps {
  label: string;
  value: string;
  metric?: MetricValue;
  helper?: string;
  accent?: "blue" | "green" | "purple" | "amber";
}

// Flat, Claude-style cards; the accent survives only as a thin top rule.
const accentClasses = {
  blue: "border-t-primary/60",
  green: "border-t-emerald-500/60",
  purple: "border-t-violet-500/60",
  amber: "border-t-amber-500/60"
};

export function KpiCard({ label, value, metric, helper, accent = "blue" }: KpiCardProps) {
  const state = metric ? stateLabel(metric) : undefined;
  const isUnavailable = metric?.value === null;

  return (
    <Card className={`overflow-hidden border-t-2 ${accentClasses[accent]}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          {state ? <Badge variant={isUnavailable ? "warning" : "secondary"}>{state}</Badge> : null}
        </div>
        <div className="mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {helper ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
