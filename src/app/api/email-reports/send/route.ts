import { NextResponse } from "next/server";
import { z } from "zod";

import { sendEmailReport } from "@/server/email";
import { emailSendRateLimiter, getClientIp, rateLimitHeaders } from "@/server/security/api-rate-limit";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  reportId: z.string().min(1).max(160)
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function POST(request: Request) {
  const rateLimit = emailSendRateLimiter.check(getClientIp(request));
  if (!rateLimit.allowed) {
    return jsonResponse({ error: "Email report send rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid email report send request" }, { status: 400 });
  }

  try {
    const deliveryLog = await sendEmailReport(parsed.data.reportId);
    return jsonResponse({ deliveryLog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email report error";
    const status = message.includes("not found") ? 404 : 500;
    return jsonResponse({ error: status === 404 ? "Email report not found" : "Email report send failed" }, { status });
  }
}
