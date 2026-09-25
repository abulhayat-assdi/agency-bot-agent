import { notFound } from "next/navigation";

import { ChatView } from "@/components/chat/chat-view";
import { loadChatPageData } from "@/server/chat/page-data";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { accounts, selection, conversation, missing } = await loadChatPageData(id);
  if (missing || !conversation) notFound();
  return <ChatView key={conversation.id} conversationId={conversation.id} initialMessages={conversation.messages} accounts={accounts} initialSelection={selection} />;
}
