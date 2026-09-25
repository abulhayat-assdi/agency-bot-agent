import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSelection } from "@/lib/chat/selection";
import { answerChat } from "@/server/chat/agent";
import { MAX_RANGE_DAYS, pickAccount, resolveRange, type ChatAccount } from "@/server/chat/data";
import type { Database } from "@/server/db/client";

const account: ChatAccount = {
  id: "11111111-1111-4111-8111-111111111111",
  metaAccountId: "act_600432049200435",
  name: "Abul Hayat (Ads)",
  currency: "USD",
  timezone: "Asia/Dhaka",
  lastSyncAt: null,
  lastSyncState: null
};
const other: ChatAccount = { ...account, id: "22222222-2222-4222-8222-222222222222", metaAccountId: "act_42", name: "Client Shop" };

describe("chat account and range resolution", () => {
  it("finds accounts by meta id, bare id, db id or name and defaults to the first", () => {
    const accounts = [account, other];
    expect(pickAccount(accounts, "act_42")).toBe(other);
    expect(pickAccount(accounts, "42")).toBe(other);
    expect(pickAccount(accounts, other.id)).toBe(other);
    expect(pickAccount(accounts, "client shop")).toBe(other);
    expect(pickAccount(accounts, undefined)).toBe(account);
    expect(pickAccount(accounts, "unknown")).toBeNull();
  });

  it("prefers explicit dates, swaps reversed ones and caps very long ranges", () => {
    expect(resolveRange(account, { since: "2026-09-24", until: "2026-09-01" })).toEqual({ since: "2026-09-01", until: "2026-09-24" });
    const capped = resolveRange(account, { since: "2020-01-01", until: "2026-09-24" });
    const days = (Date.parse(`${capped.until}T00:00:00Z`) - Date.parse(`${capped.since}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(MAX_RANGE_DAYS);
  });

  it("falls back to the last 7 days for unknown presets", () => {
    const range = resolveRange(account, { preset: "not-a-preset" });
    const days = (Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`)) / 86_400_000 + 1;
    expect(days).toBe(7);
  });
});

describe("chat selection cookie", () => {
  it("keeps valid saved values and drops unknown accounts or presets", () => {
    const raw = encodeURIComponent(JSON.stringify({ accountId: "act_42", preset: "custom", since: "2026-09-01", until: "2026-09-10" }));
    expect(parseSelection(raw, ["act_1", "act_42"])).toEqual({ accountId: "act_42", preset: "custom", since: "2026-09-01", until: "2026-09-10" });
    const stale = encodeURIComponent(JSON.stringify({ accountId: "act_gone", preset: "forever" }));
    expect(parseSelection(stale, ["act_1"])).toEqual({ accountId: "act_1", preset: "last_7_days", since: "", until: "" });
    expect(parseSelection("%%%not-json", [])).toEqual({ accountId: null, preset: "last_7_days", since: "", until: "" });
  });
});

describe("chat agent", () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://openrouter.ai/api/v1", OPENAI_MODEL: "openai/gpt-4.1-mini" };
  const db = {} as Database;

  it("runs requested read-only tools and returns the model's final answer", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        requests.push(body);
        const reply =
          requests.length === 1
            ? { choices: [{ message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "list_ad_accounts", arguments: "{}" } }] } }] }
            : { choices: [{ message: { content: "আপনার ২টা অ্যাকাউন্ট আছে।" } }], model: "openai/gpt-4.1-mini", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
        return new Response(JSON.stringify(reply), { status: 200 });
      })
    );

    const answer = await answerChat(db, "agency", [account, other], { account, range: { since: "2026-09-18", until: "2026-09-24" } }, [], "কয়টা অ্যাকাউন্ট আছে?", env);

    expect(answer.content).toBe("আপনার ২টা অ্যাকাউন্ট আছে।");
    expect(answer.toolCalls).toEqual([{ name: "list_ad_accounts", arguments: {} }]);
    expect(answer.usage.totalTokens).toBe(15);
    // The tool result is fed back to the model on the second request.
    const secondMessages = requests[1]?.messages as Array<{ role: string; content: string }>;
    expect(secondMessages.at(-1)?.role).toBe("tool");
    expect(secondMessages.at(-1)?.content).toContain("Client Shop");
    // The system prompt tells the model to answer in the user's language.
    expect((secondMessages[0]?.content ?? "").toLowerCase()).toContain("bangla");
  });

  it("explains how to start when no key and no account are configured", async () => {
    const answer = await answerChat(db, "agency", [], { account: null, range: { since: "", until: "" } }, [], "hello", {});
    expect(answer.provider).toBe("fallback");
    expect(answer.content).toContain("Settings");
  });
});
