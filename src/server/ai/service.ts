import { getAppConfig } from "@/server/config/env";
import { formatMetric } from "@/components/dashboard/metric-format";
import { logger } from "@/server/observability/logger";
import {
  getAccountSummaryEvidence,
  getAdAnalysisEvidence,
  getAnomalyEvidence,
  getBottomEntitiesEvidence,
  getDataAvailabilityEvidence,
  getTopEntitiesEvidence,
  getTrendEvidence
} from "@/server/ai/tools";
import type { AiEvidenceBlock, AiIntent, AiQuestionInput, GroundedAiAnswer, GroundedAiContext } from "@/server/ai/types";

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

async function callOpenAi(context: GroundedAiContext, env: Record<string, string | undefined>) {
  const config = getAppConfig(env);
  if (!config.OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: JSON.stringify(context) }
      ]
    })
  });

  if (!response.ok) {
    logger.warn("OpenAI analyst request failed; falling back to deterministic grounded response", {
      status: response.status,
      statusText: response.statusText
    });
    return null;
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content?.trim() || null;
}

export async function answerAiQuestion(input: Partial<AiQuestionInput>, env: Record<string, string | undefined> = process.env): Promise<GroundedAiAnswer> {
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

  const openAiAnswer = await callOpenAi(context, env);
  const answer = openAiAnswer ?? deterministicAnswer({ ...context, modelMode: "mock-grounded" });

  return {
    answer,
    context: {
      ...context,
      modelMode: openAiAnswer ? "openai" : "mock-grounded"
    }
  };
}
