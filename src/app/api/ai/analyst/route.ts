import { NextResponse } from "next/server";
import { z } from "zod";

import { answerAiQuestion, type AiPersistence } from "@/server/ai";
import { getDatabase } from "@/server/db/client";
import { getRequestAgency } from "@/server/auth/request-context";
import { auditLogSafe } from "@/server/audit/audit-log";
import { aiAnalystRateLimiter } from "@/server/security/api-rate-limit";
import { getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().min(1).max(800),
  accountId: z.string().optional(),
  adId: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  preset: z
    .enum(["today", "yesterday", "last_3_days", "last_7_days", "last_14_days", "last_28_days", "last_30_days", "this_month", "last_month"])
    .optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function POST(request: Request) {
  const rateLimit = await aiAnalystRateLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ error: "AI analyst rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return jsonResponse({ error: "Invalid AI analyst request" }, { status: 400 });
  }

  // Persist the exchange when a database is available; otherwise answer
  // without memory (existing behavior).
  let persistence: AiPersistence | undefined;
  try {
    const db = getDatabase();
    const scope = await getRequestAgency(db);
    persistence = { db, agencyId: scope.agencyId, userId: scope.userId ?? undefined, conversationId: parsed.data.conversationId };
  } catch {
    persistence = undefined;
  }

  try {
    const result = await answerAiQuestion(parsed.data, undefined, persistence ? { persistence } : {});
    if (persistence && result.conversationId && !parsed.data.conversationId) {
      await auditLogSafe({
        db: persistence.db,
        agencyId: persistence.agencyId,
        userId: persistence.userId,
        action: "ai.conversation.create",
        resourceType: "ai_conversation",
        resourceId: result.conversationId,
        metadata: {}
      });
    }
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === "AI conversation not found") {
      return jsonResponse({ error: "AI conversation not found" }, { status: 404 });
    }
    return jsonResponse({ error: "AI analyst failed to generate a grounded answer" }, { status: 500 });
  }
}
