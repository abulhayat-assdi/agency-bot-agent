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

const accentClasses = {
  blue: "from-sky-500/14 to-blue-500/5 dark:from-sky-400/20 dark:to-blue-500/5",
  green: "from-emerald-500/14 to-teal-500/5 dark:from-emerald-400/20 dark:to-teal-500/5",
  purple: "from-violet-500/14 to-fuchsia-500/5 dark:from-violet-400/20 dark:to-fuchsia-500/5",
  amber: "from-amber-500/18 to-orange-500/5 dark:from-amber-400/20 dark:to-orange-500/5"
};

export function KpiCard({ label, value, metric, helper, accent = "blue" }: KpiCardProps) {
  const state = metric ? stateLabel(metric) : undefined;
  const isUnavailable = metric?.value === null;

  return (
    <Card className="overflow-hidden">
      <CardContent className={`bg-gradient-to-br ${accentClasses[accent]} p-5`}>
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
