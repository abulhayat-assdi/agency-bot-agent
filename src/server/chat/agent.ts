import type { Database } from "@/server/db/client";
import { getAppConfig } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import {
  getAccountOverview,
  getBreakdown,
  getEntityPerformance,
  getSyncStatus,
  pickAccount,
  resolveRange,
  SYNCED_BREAKDOWNS,
  type ChatAccount,
  type DateRange,
  type EntityLevel,
  type SortKey
} from "@/server/chat/data";

/**
 * Tool-calling chat analyst. The model decides which read-only data tools to
 * call; every tool reads persisted PostgreSQL data only. Nothing here can
 * write to Meta or change stored data.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatSelection = { account: ChatAccount | null; range: DateRange };

export type ChatAnswer = {
  content: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  provider: "openai-compatible" | "fallback";
  model: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; latencyMs: number };
};

const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_RESULT_CHARS = 14_000;

const rangeProperties = {
  since: { type: "string", description: "Start date YYYY-MM-DD. Omit to use the user's selected range." },
  until: { type: "string", description: "End date YYYY-MM-DD (inclusive). Omit to use the user's selected range." },
  preset: {
    type: "string",
    enum: ["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"],
    description: "Relative range in the account timezone; ignored when since/until are given."
  }
};

const accountProperty = { account: { type: "string", description: "Ad account name or id (act_...). Omit to use the user's selected account." } };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_ad_accounts",
      description: "List every ad account the agency can see, with currency, timezone and last sync time.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_account_overview",
      description:
        "Account totals for a date range (spend, impressions, clicks, CTR, CPC, CPM, conversions, CPA, ROAS, top action types such as messages, leads or purchases), the previous equivalent period for comparison, and a daily series.",
      parameters: { type: "object", properties: { ...accountProperty, ...rangeProperties } }
    }
  },
  {
    type: "function",
    function: {
      name: "get_performance_table",
      description: "Per-campaign, per-ad-set or per-ad performance for a date range, sorted by any metric. Use for top/worst performers, comparisons and lookups by name.",
      parameters: {
        type: "object",
        properties: {
          ...accountProperty,
          ...rangeProperties,
          level: { type: "string", enum: ["campaign", "adset", "ad"] },
          sort_by: { type: "string", enum: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cpa", "roas"] },
          order: { type: "string", enum: ["desc", "asc"] },
          limit: { type: "integer", minimum: 1, maximum: 50 },
          name_contains: { type: "string", description: "Only rows whose name (or parent name) contains this text." }
        },
        required: ["level"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_breakdown",
      description: `Audience or placement breakdown for a date range. Available breakdowns: ${SYNCED_BREAKDOWNS.join(", ")}.`,
      parameters: {
        type: "object",
        properties: { ...accountProperty, ...rangeProperties, breakdown: { type: "string", enum: [...SYNCED_BREAKDOWNS] } },
        required: ["breakdown"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sync_status",
      description: "Data freshness: last sync, which dates have stored data, stored campaign/ad set/ad counts, recent sync runs and errors.",
      parameters: { type: "object", properties: { ...accountProperty } }
    }
  }
] as const;

function systemPrompt(accounts: ChatAccount[], selection: ChatSelection) {
  const today = new Date().toISOString().slice(0, 10);
  const selected = selection.account
    ? `${selection.account.name} (${selection.account.metaAccountId}, currency ${selection.account.currency}, timezone ${selection.account.timezone})`
    : "none (no ad accounts are synced yet)";
  return [
    "You are Agency AI, a friendly Meta Ads analyst inside a read-only agency reporting app.",
    "Answer in the same language the user writes in. If they write Bangla (Bengali), answer in natural Bangla; keep metric names like CTR, CPC, ROAS in English.",
    "Always fetch data with the tools before stating any number. Never invent metrics, dates, names or causes; if data is missing, say so and suggest syncing that range from Sync Ops.",
    "You are read-only: you cannot create, edit, pause or delete campaigns, budgets or ads. If asked, explain that and give a recommendation instead.",
    "Money values are in the account currency; show the currency (e.g. $14.08 for USD). Use thousands separators.",
    "Prefer short, well-structured Markdown: a one-line headline answer first, then a compact table for multi-row data, then 2-4 bullet insights or recommendations. Avoid walls of text.",
    "Use cautious causal language (suggests, may be driven by). Compare against the previous period when it helps.",
    "For messaging, lead or purchase campaigns, read the relevant action types (e.g. onsite_conversion.messaging_conversation_started_7d, lead, purchase, landing_page_view) from the actions field.",
    `Today is ${today}. The user's current selection: account ${selected}; date range ${selection.range.since} to ${selection.range.until}. Use these defaults unless the user asks for something else.`,
    `Accounts available: ${accounts.map((account) => `${account.name} (${account.metaAccountId})`).join("; ") || "none"}.`
  ].join("\n");
}

type ToolArgs = Record<string, unknown>;

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

async function runTool(db: Database, agencyId: string, accounts: ChatAccount[], selection: ChatSelection, name: string, args: ToolArgs): Promise<unknown> {
  if (name === "list_ad_accounts") return { accounts };

  const account = str(args.account) ? pickAccount(accounts, str(args.account)) : selection.account;
  if (!account) {
    return { error: accounts.length === 0 ? "No ad accounts are synced yet. Ask the user to discover and sync an account in Settings." : `Unknown account "${String(args.account)}".`, accounts };
  }
  const hasOwnRange = str(args.since) || str(args.preset);
  const range = hasOwnRange ? resolveRange(account, { since: str(args.since), until: str(args.until), preset: str(args.preset) }) : selection.range;

  switch (name) {
    case "get_account_overview":
      return getAccountOverview(db, account, range);
    case "get_performance_table":
      return getEntityPerformance(db, account, range, {
        level: (["campaign", "adset", "ad"].includes(String(args.level)) ? args.level : "campaign") as EntityLevel,
        sortBy: (str(args.sort_by) ?? "spend") as SortKey,
        order: args.order === "asc" ? "asc" : "desc",
        limit: typeof args.limit === "number" ? args.limit : undefined,
        nameContains: str(args.name_contains)
      });
    case "get_breakdown":
      return getBreakdown(db, account, range, str(args.breakdown) ?? "age");
    case "get_sync_status":
      return getSyncStatus(db, agencyId, account);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ProviderToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ProviderToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type ProviderResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: ProviderToolCall[] } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export async function answerChat(
  db: Database,
  agencyId: string,
  accounts: ChatAccount[],
  selection: ChatSelection,
  history: ChatTurn[],
  question: string,
  env: Record<string, string | undefined> = process.env
): Promise<ChatAnswer> {
  const config = getAppConfig(env);
  const startedAt = Date.now();
  const toolCalls: ChatAnswer["toolCalls"] = [];

  if (!config.OPENAI_API_KEY) {
    return fallbackAnswer(db, selection, startedAt);
  }

  const messages: ProviderMessage[] = [
    { role: "system", content: systemPrompt(accounts, selection) },
    ...history.slice(-16).map((turn) => ({ role: turn.role, content: turn.content }) as ProviderMessage),
    { role: "user", content: question }
  ];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let model: string | null = config.OPENAI_MODEL;
  const endpoint = `${config.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter attribution headers; ignored by other OpenAI-compatible providers.
        "HTTP-Referer": config.APP_URL,
        "X-Title": "Agency AI"
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL,
        temperature: 0.2,
        messages,
        // The final round forbids further tool calls so the model must answer.
        ...(round < MAX_TOOL_ROUNDS ? { tools: TOOLS, tool_choice: "auto" } : {})
      })
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      logger.warn("Chat model request failed", { status: response.status, detail });
      throw new ChatProviderError(response.status);
    }

    const body = (await response.json()) as ProviderResponse;
    model = body.model ?? model;
    usage.promptTokens += body.usage?.prompt_tokens ?? 0;
    usage.completionTokens += body.usage?.completion_tokens ?? 0;
    usage.totalTokens += body.usage?.total_tokens ?? 0;

    const message = body.choices?.[0]?.message;
    const calls = message?.tool_calls ?? [];
    if (calls.length === 0) {
      return {
        content: message?.content?.trim() || "দুঃখিত, এই প্রশ্নের উত্তর তৈরি করতে পারিনি। আবার চেষ্টা করুন।",
        toolCalls,
        provider: "openai-compatible",
        model,
        usage: { ...usage, latencyMs: Date.now() - startedAt }
      };
    }

    messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let args: ToolArgs = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as ToolArgs;
      } catch {
        args = {};
      }
      toolCalls.push({ name: call.function.name, arguments: args });
      let result: unknown;
      try {
        result = await runTool(db, agencyId, accounts, selection, call.function.name, args);
      } catch (error) {
        logger.warn("Chat tool failed", { tool: call.function.name, errorMessage: error instanceof Error ? error.message : String(error) });
        result = { error: "This data could not be loaded right now." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }

  return {
    content: "দুঃখিত, উত্তর তৈরি করতে বেশি ধাপ লেগে যাচ্ছিল। প্রশ্নটা একটু নির্দিষ্ট করে আবার জিজ্ঞেস করুন।",
    toolCalls,
    provider: "openai-compatible",
    model,
    usage: { ...usage, latencyMs: Date.now() - startedAt }
  };
}

export class ChatProviderError extends Error {
  constructor(readonly status: number) {
    super(`Chat model request failed with status ${status}`);
    this.name = "ChatProviderError";
  }
}

const money = (value: number | null, currency: string) =>
  value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const count = (value: number | null) => (value === null ? "—" : new Intl.NumberFormat("en-US").format(value));

/** Without an AI key the chat still answers with a factual overview of the selection. */
async function fallbackAnswer(db: Database, selection: ChatSelection, startedAt: number): Promise<ChatAnswer> {
  const base = { toolCalls: [], provider: "fallback" as const, model: null };
  const usage = { promptTokens: null, completionTokens: null, totalTokens: null, latencyMs: 0 };
  if (!selection.account) {
    return { ...base, content: "এখনো কোনো ad account sync হয়নি। **Settings → Discover Ad Accounts → Sync Account** থেকে একটা account sync করুন।", usage };
  }
  const overview = await getAccountOverview(db, selection.account, selection.range);
  const t = overview.totals;
  const c = selection.account.currency;
  const lines = [
    `**${selection.account.name}** · ${selection.range.since} → ${selection.range.until}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Spend | ${money(t.spend, c)} |`,
    `| Impressions | ${count(t.impressions)} |`,
    `| Clicks | ${count(t.clicks)} |`,
    `| CTR | ${t.ctr === null ? "—" : `${t.ctr}%`} |`,
    `| CPC | ${money(t.cpc, c)} |`,
    `| Conversions | ${count(t.conversions)} |`,
    "",
    overview.note ?? "",
    "> AI key সেট করা নেই, তাই শুধু মূল হিসাব দেখানো হলো। প্রশ্নের পূর্ণ উত্তর পেতে Coolify-তে `OPENAI_API_KEY` (OpenRouter key) বসান।"
  ];
  return { ...base, content: lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n"), usage: { ...usage, latencyMs: Date.now() - startedAt } };
}
