import { notFound } from "next/navigation";
import type { SourceRef } from "@/components/ai/SourceRefCard";
import { loadOwnedConversation, listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePageSession } from "@/lib/server/page-auth";
import { AskPanel } from "../_components/AskPanel";
import { AskWorkspace } from "../_components/AskWorkspace";
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
    <AskWorkspace sidebar={<ConversationList rows={conversations} activeConversationId={conversation.id} />}>
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
    </AskWorkspace>
  );
}
