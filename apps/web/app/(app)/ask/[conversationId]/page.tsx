import { notFound } from "next/navigation";
import type { SourceRef } from "@/components/ai/SourceRefCard";
import { loadOwnedConversation, listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePageSession } from "@/lib/server/page-auth";
import { AskPanel } from "../_components/AskPanel";
import { ConversationList } from "../_components/ConversationList";

export default async function AskConversationPage(props: { params: Promise<{ conversationId: string }> }) {
  const session = await requirePageSession("/ask");
  const params = await props.params;
  const [conversation, conversations] = await Promise.all([
    loadOwnedConversation({
      workspaceId: session.workspaceId,
      userId: session.userId,
      conversationId: params.conversationId,
    }),
    listOwnedConversations({
      workspaceId: session.workspaceId,
      userId: session.userId,
    }),
  ]);

  if (!conversation) {
    notFound();
  }

  return (
    <div className="grid h-full min-h-0 flex-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <ConversationList rows={conversations} activeConversationId={conversation.id} />
      <AskPanel
        key={conversation.id}
        conversationId={conversation.id}
        initialMessages={conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations as SourceRef[],
        }))}
      />
    </div>
  );
}
