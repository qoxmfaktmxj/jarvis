import { notFound } from "next/navigation";
import { loadOwnedConversation, listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePageSession } from "@/lib/server/page-auth";
import { AskPanel } from "../_components/AskPanel";
import { ConversationList } from "../_components/ConversationList";
import { ConversationView } from "../_components/ConversationView";

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
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <ConversationList rows={conversations} />
      <div className="space-y-6">
        <ConversationView conversation={conversation} />
        <AskPanel conversationId={conversation.id} />
      </div>
    </div>
  );
}
