import { describe, expect, it } from "vitest";

import { answerAiQuestion, classifyAiIntent } from "@/server/ai";

describe("grounded AI analyst", () => {
  it("classifies common read-only analytics intents", () => {
    expect(classifyAiIntent("Which campaigns are top performers?")).toBe("top_performers");
    expect(classifyAiIntent("Show me underperforming campaigns")).toBe("bottom_performers");
    expect(classifyAiIntent("Explain anomaly risks")).toBe("anomalies");
    expect(classifyAiIntent("Which metrics are missing?", {})).toBe("data_availability");
    expect(classifyAiIntent("Analyze this", { adId: "ad_1" })).toBe("ad_analysis");
  });

  it("answers with visible grounded account evidence without OpenAI", async () => {
    const result = await answerAiQuestion(
      {
        question: "Summarize performance",
        accountId: "act_100000000000001",
        preset: "last_7_days"
      },
      { APP_ENV: "test", META_PROVIDER: "mock" }
    );

    expect(result.context.modelMode).toBe("mock-grounded");
    expect(result.context.evidence.map((item) => item.toolName)).toContain("get_account_summary");
    expect(result.answer).toContain("Supporting evidence");
    expect(result.answer).not.toMatch(/actual profit/i);
  });

  it("grounds selected ad analysis to the requested ad", async () => {
    const result = await answerAiQuestion(
      {
        question: "Analyze this ad",
        adId: "1000000000000011011119",
        preset: "last_7_days"
      },
      { APP_ENV: "test", META_PROVIDER: "mock" }
    );

    expect(result.context.intent).toBe("ad_analysis");
    expect(result.context.evidence[0]?.toolName).toBe("get_ad_performance");
    expect(result.context.evidence[0]?.id).toContain("1000000000000011011119");
    expect(result.context.evidence[0]?.records?.[0]).toHaveProperty("creativeId");
  });

  it("refuses to invent metrics for unavailable selected ads", async () => {
    const result = await answerAiQuestion(
      {
        question: "Analyze this ad",
        adId: "ad_missing",
        preset: "last_7_days"
      },
      { APP_ENV: "test", META_PROVIDER: "mock" }
    );

    expect(result.context.evidence[0]?.metrics).toHaveLength(0);
    expect(result.answer).toContain("cannot answer with account-specific performance metrics");
    expect(result.answer).toContain("must not invent");
  });

  it("does not expose OpenAI or provider secrets in grounded context", async () => {
    const result = await answerAiQuestion(
      {
        question: "Which metrics are unavailable?",
        accountId: "act_100000000000001"
      },
      {
        APP_ENV: "test",
        META_PROVIDER: "mock"
      }
    );

    const serialized = JSON.stringify(result.context);
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });
});
