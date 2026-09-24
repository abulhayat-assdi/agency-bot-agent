import Link from "next/link";
import { Bot, BrainCircuit, DatabaseZap, ShieldCheck } from "lucide-react";

import { AiAnswer } from "@/components/ai/ai-answer";
import { AiControls } from "@/components/ai/ai-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDatabase, type Database } from "@/server/db/client";
import { getRequestAgency } from "@/server/auth/request-context";
import { getDashboardData } from "@/server/dashboard/mock-dashboard-data";
import { answerAiQuestion } from "@/server/ai";
import { AiConversationRepository, AiMessageRepository } from "@/server/repositories/ai-repository";
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
  const requestedConversationId = readParam(params, "conversationId");
  const shouldAnswer = Boolean(readParam(params, "q") || adId);

  // Persisted memory when a database is available; otherwise answer statelessly.
  let persistence: { db: Database; agencyId: string; userId?: string } | null = null;
  try {
    const db = getDatabase();
    const scope = await getRequestAgency(db);
    persistence = { db, agencyId: scope.agencyId, userId: scope.userId ?? undefined };
  } catch {
    persistence = null;
  }

  const result =
    shouldAnswer
      ? await answerAiQuestion(
          { question, accountId, adId, preset },
          undefined,
          persistence ? { persistence: { ...persistence, conversationId: requestedConversationId } } : {}
        ).catch(() => null)
      : null;
  const activeConversationId = result?.conversationId ?? requestedConversationId ?? undefined;

  let conversations: Array<{ id: string; title: string; updatedAt: string }> = [];
  let thread: Array<{ id: string; role: string; content: string; createdAt: string }> = [];
  if (persistence) {
    try {
      const repository = new AiConversationRepository({ db: persistence.db, agencyId: persistence.agencyId });
      const rows = await repository.list({ userId: persistence.userId, limit: 20 });
      conversations = rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() }));
      if (activeConversationId) {
        const messages = new AiMessageRepository({ db: persistence.db, agencyId: persistence.agencyId });
        const messageRows = (await messages.listByConversation(activeConversationId, 50)) ?? [];
        const chronological = [...messageRows].reverse();
        // Drop the pair just created by this request to avoid duplicating the fresh answer below.
        const visible = result && chronological.length >= 2 ? chronological.slice(0, -2) : chronological;
        thread = visible.map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.createdAt.toISOString() }));
      }
    } catch {
      conversations = [];
      thread = [];
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">Grounded analytics chat</p>
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

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>{conversations.length > 0 ? "Continue a previous analysis." : "No saved conversations yet."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/ai-analyst">New conversation</Link>
            </Button>
            {conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/ai-analyst?conversationId=${encodeURIComponent(conversation.id)}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""}&preset=${preset}`}
                className={`block rounded-2xl border p-3 text-sm transition hover:bg-muted ${conversation.id === activeConversationId ? "border-primary/50 bg-muted" : "border-border/80"}`}
              >
                <span className="font-medium">{conversation.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{conversation.updatedAt.slice(0, 16).replace("T", " ")}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <AiControls accounts={dashboard.accounts} defaultQuestion={question} selectedAccountId={accountId} selectedPreset={preset} conversationId={activeConversationId} />
          {thread.length > 0 ? (
            <div className="space-y-3">
              {thread.map((message) => (
                <div
                  key={message.id}
                  className={`whitespace-pre-wrap rounded-3xl border p-4 text-sm leading-7 ${message.role === "user" ? "border-border/80 bg-card/70" : "border-border/80 bg-card/70 dark:border-white/10 dark:bg-slate-950/60"}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{message.role}</p>
                  {message.content}
                </div>
              ))}
            </div>
          ) : null}

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
              <BrainCircuit className="h-5 w-5 text-primary" aria-hidden="true" />
              Accuracy-first analyst ready
            </CardTitle>
            <CardDescription>Select a suggested prompt or ask your own question.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl metric-surface p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <DatabaseZap className="h-4 w-4" aria-hidden="true" />
                Tool-first answers
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Every analytical answer includes visible tool evidence, metric states, date range, timezone, and caveats.</p>
            </div>
            <div className="rounded-3xl metric-surface p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-100">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                No write actions
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The AI cannot create, edit, pause, delete, target, budget, or mutate Meta entities.</p>
            </div>
            <div className="rounded-3xl metric-surface p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-100">
                <Bot className="h-4 w-4" aria-hidden="true" />
                OpenAI optional
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">When `OPENAI_API_KEY` is absent, a deterministic grounded response is shown using the same evidence contract.</p>
            </div>
          </CardContent>
        </Card>
      )}
        </div>
      </div>
    </div>
  );
}
