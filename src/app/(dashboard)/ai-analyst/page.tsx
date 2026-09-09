import Link from "next/link";
import { Bot, BrainCircuit, DatabaseZap, ShieldCheck } from "lucide-react";

import { AiAnswer } from "@/components/ai/ai-answer";
import { AiControls } from "@/components/ai/ai-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";
import { answerAiQuestion } from "@/server/ai";
import type { DateRangePreset } from "@/lib/dates/reporting";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const suggestedQuestions = [
  "Summarize performance and highlight any risks.",
  "Which campaigns are the top performers by ROAS?",
  "Which campaigns are underperforming?",
  "Explain anomalies and risks for this account.",
  "Which metrics are unavailable or unsupported?"
];

function readParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizePreset(value: string | undefined): DateRangePreset {
  const allowed: DateRangePreset[] = ["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"];
  return allowed.includes(value as DateRangePreset) ? (value as DateRangePreset) : "last_7_days";
}

export default async function AiAnalystPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dashboard = await getDashboardData({ preset: "last_7_days" });
  const question = readParam(params, "q") ?? suggestedQuestions[0];
  const accountId = readParam(params, "accountId") ?? dashboard.accounts[0]?.id;
  const adId = readParam(params, "adId");
  const preset = normalizePreset(readParam(params, "preset"));
  const shouldAnswer = Boolean(readParam(params, "q") || adId);
  const result = shouldAnswer ? await answerAiQuestion({ question, accountId, adId, preset }) : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Grounded analytics chat</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">AI Analyst</h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
            Ask account-specific questions that are answered only after controlled read-only analytics tools return verified context.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Read-only tools</Badge>
          <Badge variant="secondary">Grounded context</Badge>
        </div>
      </section>

      <AiControls accounts={dashboard.accounts} defaultQuestion={question} selectedAccountId={accountId} selectedPreset={preset} />

      <div className="grid gap-3 md:grid-cols-5">
        {suggestedQuestions.map((suggestion) => (
          <Button key={suggestion} asChild variant="outline" size="sm" className="h-auto min-h-10 whitespace-normal py-2 text-left">
            <Link href={`/ai-analyst?q=${encodeURIComponent(suggestion)}&accountId=${encodeURIComponent(accountId ?? "")}&preset=${preset}`}>{suggestion}</Link>
          </Button>
        ))}
      </div>

      {result ? (
        <AiAnswer result={result} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-sky-300" aria-hidden="true" />
              Accuracy-first analyst ready
            </CardTitle>
            <CardDescription>Select a suggested prompt or ask your own question.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
                <DatabaseZap className="h-4 w-4" aria-hidden="true" />
                Tool-first answers
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Every analytical answer includes visible tool evidence, metric states, date range, timezone, and caveats.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                No write actions
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The AI cannot create, edit, pause, delete, target, budget, or mutate Meta entities.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-100">
                <Bot className="h-4 w-4" aria-hidden="true" />
                OpenAI optional
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">When `OPENAI_API_KEY` is absent, a deterministic grounded response is shown using the same evidence contract.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
