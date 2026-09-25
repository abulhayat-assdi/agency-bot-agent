import { ChatView } from "@/components/chat/chat-view";
import { loadChatPageData } from "@/server/chat/page-data";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
  const { accounts, selection } = await loadChatPageData();
  // Keyed so "New chat" always starts from a clean state.
  return <ChatView key="new" conversationId={null} initialMessages={[]} accounts={accounts} initialSelection={selection} />;
}
