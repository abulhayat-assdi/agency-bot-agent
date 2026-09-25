import { cookies } from "next/headers";

import { parseSelection, SELECTION_COOKIE, type ChatSelectionState } from "@/lib/chat/selection";
import { getRequestAgency } from "@/server/auth/request-context";
import { listChatAccounts } from "@/server/chat/data";
import { getDatabase } from "@/server/db/client";
import { AiConversationRepository, AiMessageRepository } from "@/server/repositories/ai-repository";

export type ChatPageData = {
  accounts: Array<{ id: string; name: string; currency: string }>;
  selection: ChatSelectionState;
  conversation: { id: string; messages: Array<{ id: string; role: "user" | "assistant"; content: string }> } | null;
};

/** Loads what the chat screen needs; `null` conversation means it does not exist. */
export async function loadChatPageData(conversationId?: string): Promise<ChatPageData & { missing: boolean }> {
  const savedSelection = (await cookies()).get(SELECTION_COOKIE)?.value;
  let db;
  try {
    db = getDatabase();
  } catch {
    return { accounts: [], selection: parseSelection(savedSelection, []), conversation: null, missing: Boolean(conversationId) };
  }
  const { agencyId } = await getRequestAgency(db);
  const accounts = (await listChatAccounts(db, agencyId)).map((account) => ({ id: account.metaAccountId, name: account.name, currency: account.currency }));
  const selection = parseSelection(savedSelection, accounts.map((account) => account.id));
  if (!conversationId) return { accounts, selection, conversation: null, missing: false };

  const conversation = await new AiConversationRepository({ db, agencyId }).findById(conversationId);
  if (!conversation) return { accounts, selection, conversation: null, missing: true };
  const rows = (await new AiMessageRepository({ db, agencyId }).listByConversation(conversationId, 200)) ?? [];
  const messages = [...rows]
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ id: row.id, role: row.role as "user" | "assistant", content: row.content }));
  return { accounts, selection, conversation: { id: conversation.id, messages }, missing: false };
}
