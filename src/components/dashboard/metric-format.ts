import type { MetricValue } from "@/server/analytics";
import { formatCurrency } from "@/lib/currency/format";

export function formatMetric(metric: MetricValue | undefined, options: { kind?: "number" | "currency" | "percent" | "ratio"; currency?: string } = {}) {
  if (!metric || metric.value === null) return "Unavailable";

  if (options.kind === "currency") return formatCurrency(metric.value, options.currency ?? "USD");
  if (options.kind === "percent") return `${metric.value.toFixed(2)}%`;
  if (options.kind === "ratio") return metric.value.toFixed(2);

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(metric.value);
}

export function stateLabel(metric: MetricValue | undefined) {
  if (!metric) return "unavailable";
  return metric.state.replaceAll("_", " ");
}
