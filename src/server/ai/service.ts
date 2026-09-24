import { getAppConfig } from "@/server/config/env";
import { formatMetric } from "@/components/dashboard/metric-format";
import { logger } from "@/server/observability/logger";
import type { Database } from "@/server/db/client";
import {
  AiConversationRepository,
  AiMessageRepository
} from "@/server/repositories/ai-repository";
import type { RepositoryContext } from "@/server/repositories/types";
import {
  getAccountSummaryEvidence,
  getAdAnalysisEvidence,
  getAnomalyEvidence,
  getBottomEntitiesEvidence,
  getDataAvailabilityEvidence,
  getTopEntitiesEvidence,
  getTrendEvidence
} from "@/server/ai/tools";
import type { AiEvidenceBlock, AiIntent, AiProviderMessage, AiQuestionInput, AiUsage, GroundedAiAnswer, GroundedAiContext } from "@/server/ai/types";

export const MAX_HISTORY_MESSAGES = 10;
export const MAX_HISTORY_CHARS = 6000;

export type AiPersistence = {
  db: Database;
  agencyId: string;
  userId?: string;
  conversationId?: string;
};

export type AiAnswerOptions = {
  persistence?: AiPersistence;
};

const DEFAULT_QUESTION = "Summarize performance and highlight any risks.";

function normalizeQuestion(question: string | undefined) {
  const normalized = question?.trim();
  return normalized && normalized.length <= 800 ? normalized : DEFAULT_QUESTION;
}

export function classifyAiIntent(question: string, input: Pick<AiQuestionInput, "adId"> = {}): AiIntent {
  const value = question.toLowerCase();
  if (input.adId || value.includes("this ad") || value.includes("selected ad")) return "ad_analysis";
  if (value.includes("bottom") || value.includes("worst") || value.includes("underperform")) return "bottom_performers";
  if (value.includes("top") || value.includes("best") || value.includes("winner")) return "top_performers";
  if (value.includes("anomal") || value.includes("risk") || value.includes("alert")) return "anomalies";
  if (value.includes("available") || value.includes("missing") || value.includes("unsupported") || value.includes("null")) return "data_availability";
  return "account_summary";
}

async function collectEvidence(input: AiQuestionInput, intent: AiIntent): Promise<AiEvidenceBlock[]> {
  if (intent === "ad_analysis") return [await getAdAnalysisEvidence(input)];
  if (intent === "top_performers") return [await getAccountSummaryEvidence(input), await getTopEntitiesEvidence(input)];
  if (intent === "bottom_performers") return [await getAccountSummaryEvidence(input), await getBottomEntitiesEvidence(input)];
  if (intent === "anomalies") return [await getAnomalyEvidence(input), await getTrendEvidence(input)];
  if (intent === "data_availability") return [await getDataAvailabilityEvidence(input)];
  return [await getAccountSummaryEvidence(input), await getTrendEvidence(input)];
}

function metricLine(metric: AiEvidenceBlock["metrics"][number]) {
  return `${metric.label}: ${formatMetric(metric.metric, { kind: metric.format, currency: metric.currency })} (${metric.metric.state})`;
}

function firstAvailableMetric(evidence: AiEvidenceBlock, label: string) {
  return evidence.metrics.find((metric) => metric.label === label);
}

function renderRecords(records: AiEvidenceBlock["records"] = []) {
  if (records.length === 0) return "No detailed records were returned by the selected read-only tool.";
  return records
    .slice(0, 6)
    .map((record, index) => {
      const values = Object.entries(record)
        .map(([key, value]) => `${key}: ${value ?? "unavailable"}`)
        .join(", ");
      return `${index + 1}. ${values}`;
    })
    .join("\n");
}

function deterministicAnswer(context: GroundedAiContext) {
  const primary = context.evidence[0];
  const secondary = context.evidence[1];

  if (!primary || primary.metrics.length === 0) {
    return [
      "I cannot answer with account-specific performance metrics because the controlled analytics tool did not return usable data.",
      "I must not invent, infer, estimate, or fill missing Meta metrics. Please select a connected account/ad or wait for sync data to become available."
    ].join("\n\n");
  }

  const spend = firstAvailableMetric(primary, "Spend");
  const conversions = firstAvailableMetric(primary, "Conversions");
  const roas = firstAvailableMetric(primary, "ROAS");
  const cpa = firstAvailableMetric(primary, "CPA");

  const finding = [
    `Finding: For ${primary.scope}, the selected period is ${primary.dateRange}.`,
    spend ? `Spend is ${metricLine(spend)}.` : null,
    conversions ? `Conversions are ${metricLine(conversions)}.` : null,
    roas ? `ROAS is ${metricLine(roas)}.` : null,
    cpa ? `CPA is ${metricLine(cpa)}.` : null
  ]
    .filter(Boolean)
    .join(" ");

  const evidence = [
    "Supporting evidence:",
    ...primary.metrics.slice(0, 8).map((metric) => `- ${metricLine(metric)}`),
    secondary?.records?.length ? `\nAdditional tool records from ${secondary.title}:\n${renderRecords(secondary.records)}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const caveats = [...new Set(context.evidence.flatMap((block) => block.caveats))].slice(0, 4);

  return [
    finding,
    evidence,
    "Explanation: This answer is grounded in the app's deterministic analytics outputs. It does not calculate profit and it does not convert unavailable/null/unsupported states into zero.",
    "Recommendation: Review the listed metric states and investigate the highest-impact campaign/ad records before making optimization changes outside this read-only platform.",
    `Data caveats:\n${caveats.map((caveat) => `- ${caveat}`).join("\n")}`
  ].join("\n\n");
}

function systemPrompt() {
  return [
    "You are a read-only Meta Ads analyst inside an agency analytics platform.",
    "Use only the provided JSON evidence. Do not invent metrics, dates, client names, account IDs, or causes.",
    "Never claim actual profit. You may discuss spend, conversion value, CPA, ROAS, CTR, CPC, conversions, and data availability.",
    "Preserve null/unavailable/unsupported/partial semantics and mention caveats when relevant.",
    "Use cautious causal language such as suggests, may be driven by, or is consistent with.",
    "Return a concise answer with: Finding, Supporting evidence, Explanation, Recommendation, Date range/timezone, and Caveats."
  ].join("\n");
}

type ProviderResult = {
  content: string | null;
  usage: AiUsage;
  model: string;
};

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyUsage(): AiUsage {
  return { promptTokens: null, completionTokens: null, totalTokens: null, latencyMs: null };
}

async function callOpenAi(
  context: GroundedAiContext,
  env: Record<string, string | undefined>,
  history: AiProviderMessage[] = []
): Promise<ProviderResult | null> {
  const config = getAppConfig(env);
  if (!config.OPENAI_API_KEY) return null;

  const startedAt = Date.now();
  const response = await fetch(`${config.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      temperature: 0.1,
      messages: [{ role: "system", content: systemPrompt() }, ...history, { role: "user", content: JSON.stringify(context) }]
    })
  });
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    logger.warn("OpenAI analyst request failed; falling back to deterministic grounded response", {
      status: response.status,
      statusText: response.statusText
    });
    return null;
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  };
  return {
    content: body.choices?.[0]?.message?.content?.trim() || null,
    // Token counts come straight from the provider response; unknown stays null, never zero.
    usage: {
      promptTokens: toFiniteNumber(body.usage?.prompt_tokens),
      completionTokens: toFiniteNumber(body.usage?.completion_tokens),
      totalTokens: toFiniteNumber(body.usage?.total_tokens),
      latencyMs
    },
    model: typeof body.model === "string" && body.model.length > 0 ? body.model : config.OPENAI_MODEL
  };
}

/**
 * Load bounded conversation history for provider context. Only user/assistant
 * text is forwarded (tool payloads stay in storage), oldest messages are
 * dropped first, and total characters are capped to bound token usage.
 */
export function buildHistoryMessages(
  rows: Array<{ role: string; content: string }>,
  maxMessages: number = MAX_HISTORY_MESSAGES,
  maxChars: number = MAX_HISTORY_CHARS
): AiProviderMessage[] {
  const eligible = rows.filter((row) => row.role === "user" || row.role === "assistant");
  const windowed = eligible.slice(-maxMessages);
  const history: AiProviderMessage[] = [];
  let chars = 0;
  for (let index = windowed.length - 1; index >= 0; index -= 1) {
    const row = windowed[index];
    const content = row.content.slice(0, maxChars);
    if (chars + content.length > maxChars && history.length > 0) break;
    chars += content.length;
    history.unshift({ role: row.role as "user" | "assistant", content });
  }
  return history;
}

export async function answerAiQuestion(
  input: Partial<AiQuestionInput>,
  env: Record<string, string | undefined> | undefined = process.env,
  options: AiAnswerOptions = {}
): Promise<GroundedAiAnswer> {
  const question = normalizeQuestion(input.question);
  const intent = classifyAiIntent(question, { adId: input.adId });
  const evidence = await collectEvidence({ ...input, question }, intent);
  const config = getAppConfig(env);
  const context: GroundedAiContext = {
    intent,
    question,
    generatedAt: new Date("2026-09-10T12:00:00.000Z").toISOString(),
    modelMode: config.OPENAI_API_KEY ? "openai" : "mock-grounded",
    evidence
  };

  const persistence = options.persistence;
  let history: AiProviderMessage[] = [];
  let conversationId: string | undefined;
  let conversations: AiConversationRepository | null = null;
  let messages: AiMessageRepository | null = null;

  if (persistence) {
    const repositoryContext: RepositoryContext = { db: persistence.db, agencyId: persistence.agencyId };
    conversations = new AiConversationRepository(repositoryContext);
    messages = new AiMessageRepository(repositoryContext);
    if (persistence.conversationId) {
      const existing = await conversations.findById(persistence.conversationId);
      if (!existing) throw new Error("AI conversation not found");
      conversationId = existing.id;
      const prior = (await messages.listByConversation(conversationId, MAX_HISTORY_MESSAGES + 5)) ?? [];
      history = buildHistoryMessages([...prior].reverse());
    } else {
      const created = await conversations.create({
        userId: persistence.userId,
        title: question.slice(0, 80)
      });
      conversationId = created.id;
    }
    await messages.add(conversationId, { role: "user", content: question, toolCalls: [], groundedContext: {} });
  }

  const providerResult = await callOpenAi(context, env, history);
  const answer = providerResult?.content ?? deterministicAnswer({ ...context, modelMode: "mock-grounded" });
  const usedOpenAi = Boolean(providerResult?.content);

  if (persistence && conversations && messages && conversationId) {
    await messages.add(conversationId, {
      role: "assistant",
      content: answer,
      toolCalls: [],
      groundedContext: {
        intent,
        evidence: evidence.map((block) => ({ toolName: block.toolName, title: block.title, scope: block.scope }))
      },
      provider: usedOpenAi ? "openai" : "mock-grounded",
      model: providerResult?.model ?? "deterministic",
      usage: (usedOpenAi ? providerResult?.usage : emptyUsage()) ?? emptyUsage()
    });
    await conversations.touch(conversationId);
  }

  return {
    answer,
    context: {
      ...context,
      modelMode: usedOpenAi ? "openai" : "mock-grounded"
    },
    ...(conversationId ? { conversationId } : {})
  };
}
