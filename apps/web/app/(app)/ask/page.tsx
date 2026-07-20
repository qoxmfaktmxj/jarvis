import { listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePageSession } from "@/lib/server/page-auth";
import { AskPanel } from "./_components/AskPanel";
import { ConversationList } from "./_components/ConversationList";

export default async function AskHomePage() {
  const session = await requirePageSession("/ask");
  const conversations = await listOwnedConversations({
    workspaceId: session.workspaceId,
    userId: session.userId,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <ConversationList rows={conversations} />
      <AskPanel />
    </div>
  );
}
