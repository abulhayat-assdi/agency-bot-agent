import { Bot, DatabaseZap, ShieldCheck } from "lucide-react";

import { formatMetric } from "@/components/dashboard/metric-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GroundedAiAnswer } from "@/server/ai";

export function AiAnswer({ result }: { result: GroundedAiAnswer }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-300" aria-hidden="true" />
              Grounded response
            </CardTitle>
            <Badge variant={result.context.modelMode === "openai" ? "success" : "secondary"}>{result.context.modelMode === "openai" ? "OpenAI grounded" : "Mock grounded"}</Badge>
          </div>
          <CardDescription>Intent: {result.context.intent.replaceAll("_", " ")} · Generated from controlled read-only tool evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-sm leading-7 text-slate-100">{result.answer}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            Tool evidence
          </CardTitle>
          <CardDescription>Evidence is exposed for auditability and to prevent hidden model-only calculations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.context.evidence.map((block) => (
            <div key={block.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{block.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{block.toolName} · {block.scope}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{block.dateRange}</div>
                </div>
                <Badge variant="secondary">{block.timezone}</Badge>
              </div>

              {block.metrics.length > 0 ? (
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  {block.metrics.map((metric) => (
                    <div key={`${block.id}-${metric.label}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <dt className="text-muted-foreground">{metric.label}</dt>
                      <dd className="mt-1 font-semibold text-slate-100">{formatMetric(metric.metric, { kind: metric.format, currency: metric.currency })}</dd>
                      <dd className="mt-1 text-[11px] text-muted-foreground">{metric.metric.state.replaceAll("_", " ")}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {block.records?.length ? (
                <div className="mt-4 space-y-2">
                  {block.records.slice(0, 4).map((record, index) => (
                    <div key={`${block.id}-record-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">
                      {Object.entries(record).map(([key, value]) => `${key}: ${value ?? "unavailable"}`).join(" · ")}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <div className="flex gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100/80">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
            AI tools are read-only and cannot create, edit, pause, delete, or budget Meta entities.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
