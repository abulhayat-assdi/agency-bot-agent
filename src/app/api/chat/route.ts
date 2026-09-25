import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { answerChat, ChatProviderError, type ChatTurn } from "@/server/chat/agent";
import { listChatAccounts, pickAccount, resolveRange } from "@/server/chat/data";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { AiConversationRepository, AiMessageRepository } from "@/server/repositories/ai-repository";
import { aiAnalystRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  accountId: z.string().max(80).optional(),
  preset: z.string().max(40).optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

function titleFrom(message: string) {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}

export async function POST(request: Request) {
  const rateLimit = await aiAnalystRateLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ ok: false, error: "Too many messages. Please wait a minute." }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: "Invalid chat request" }, { status: 400 });
  const input = parsed.data;

  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }

  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const context = { db, agencyId };
    const conversations = new AiConversationRepository(context);
    const messages = new AiMessageRepository(context);

    const accounts = await listChatAccounts(db, agencyId);
    const account = pickAccount(accounts, input.accountId);
    const range = account
      ? resolveRange(account, { since: input.since, until: input.until, preset: input.preset })
      : { since: input.since ?? "", until: input.until ?? "" };

    let conversationId = input.conversationId ?? null;
    let history: ChatTurn[] = [];
    if (conversationId) {
      const existing = await conversations.findById(conversationId);
      if (!existing) return jsonResponse({ ok: false, error: "Conversation not found" }, { status: 404 });
      const rows = (await messages.listByConversation(conversationId, 30)) ?? [];
      history = [...rows]
        .reverse()
        .filter((row) => row.role === "user" || row.role === "assistant")
        .map((row) => ({ role: row.role as ChatTurn["role"], content: row.content }));
    }

    const answer = await answerChat(db, agencyId, accounts, { account, range }, history, input.message);

    if (!conversationId) {
      const created = await conversations.create({ title: titleFrom(input.message), userId, adAccountId: account?.id ?? null });
      conversationId = created.id;
      await auditLogSafe({ db, agencyId, userId, action: "ai.conversation.create", resourceType: "ai_conversation", resourceId: conversationId, metadata: {} });
    }
    const selection = { accountId: account?.metaAccountId ?? null, range };
    await messages.add(conversationId, { role: "user", content: input.message, groundedContext: selection });
    const saved = await messages.add(conversationId, {
      role: "assistant",
      content: answer.content,
      toolCalls: answer.toolCalls,
      groundedContext: selection,
      provider: answer.provider,
      model: answer.model,
      usage: answer.usage
    });
    await conversations.touch(conversationId);

    return jsonResponse({
      ok: true,
      conversationId,
      message: { id: saved?.id ?? null, role: "assistant", content: answer.content, toolCalls: answer.toolCalls.map((call) => call.name) },
      range
    });
  } catch (error) {
    if (error instanceof ChatProviderError) {
      const hint =
        error.status === 401 || error.status === 403
          ? "AI key কাজ করছে না। Coolify-তে OPENAI_API_KEY (OpenRouter key) ঠিক আছে কিনা দেখুন।"
          : error.status === 402
            ? "OpenRouter অ্যাকাউন্টে ক্রেডিট শেষ। ক্রেডিট যোগ করে আবার চেষ্টা করুন।"
            : "AI সার্ভিস এই মুহূর্তে সাড়া দিচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
      return jsonResponse({ ok: false, error: hint }, { status: 502 });
    }
    logger.error("Chat request failed", { errorName: error instanceof Error ? error.name : "unknown", errorMessage: error instanceof Error ? error.message : String(error) });
    return jsonResponse({ ok: false, error: "উত্তর তৈরি করা যায়নি। আবার চেষ্টা করুন।" }, { status: 500 });
  }
}
