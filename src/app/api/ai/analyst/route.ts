import { NextResponse } from "next/server";
import { z } from "zod";

import { answerAiQuestion } from "@/server/ai";
import { aiAnalystRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().min(1).max(800),
  accountId: z.string().optional(),
  adId: z.string().optional(),
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
  const rateLimit = aiAnalystRateLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ error: "AI analyst rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return jsonResponse({ error: "Invalid AI analyst request" }, { status: 400 });
  }

  try {
    const result = await answerAiQuestion(parsed.data);
    return jsonResponse(result);
  } catch {
    return jsonResponse({ error: "AI analyst failed to generate a grounded answer" }, { status: 500 });
  }
}
