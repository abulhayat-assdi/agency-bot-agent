import { NextResponse } from "next/server";

import { getDatabase } from "@/server/db/client";
import { getRequestAgency } from "@/server/auth/request-context";
import { AiConversationRepository, AiMessageRepository } from "@/server/repositories/ai-repository";
import { applySecurityHeaders } from "@/server/security/headers";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  applySecurityHeaders(response.headers);
  return response;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  let db;
  try {
    db = getDatabase();
  } catch {
    return jsonResponse({ ok: false, error: "Database is not configured" }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    const { agencyId } = await getRequestAgency(db);
    const repositoryContext = { db, agencyId };
    const conversations = new AiConversationRepository(repositoryContext);
    const conversation = await conversations.findById(id);
    if (!conversation) return jsonResponse({ ok: false, error: "Conversation not found" }, { status: 404 });
    const messages = new AiMessageRepository(repositoryContext);
    const rows = (await messages.listByConversation(id, 50)) ?? [];
    return jsonResponse({
      ok: true,
      conversation: { id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt.toISOString() },
      messages: [...rows].reverse().map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        provider: row.provider,
        model: row.model,
        usage: row.usage,
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch {
    return jsonResponse({ ok: false, error: "Conversation is unavailable" }, { status: 500 });
  }
}
