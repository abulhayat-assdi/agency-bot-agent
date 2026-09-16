import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { getRequestAgency } from "@/server/auth/request-context";
import { AiConversationRepository } from "@/server/repositories/ai-repository";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(1).max(240).optional()
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

export async function GET(request: Request) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50));
    const conversations = new AiConversationRepository({ db, agencyId });
    const rows = await conversations.list({ userId: userId ?? undefined, limit });
    return jsonResponse({
      ok: true,
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch {
    return jsonResponse({ ok: false, error: "Conversations are unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "Invalid conversation request" }, { status: 400 });
  }
  try {
    const { agencyId, userId } = await getRequestAgency(db);
    const conversations = new AiConversationRepository({ db, agencyId });
    const created = await conversations.create({
      userId: userId ?? null,
      title: parsed.data.title ?? "New analysis"
    });
    return jsonResponse({ ok: true, conversationId: created.id }, { status: 201 });
  } catch {
    return jsonResponse({ ok: false, error: "Conversation creation failed" }, { status: 500 });
  }
}
