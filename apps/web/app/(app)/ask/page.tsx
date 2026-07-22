import { listOwnedConversations } from "@/lib/server/conversation-repository";
import { requirePageSession } from "@/lib/server/page-auth";
import { AskPanel } from "./_components/AskPanel";
import { AskWorkspace } from "./_components/AskWorkspace";
import { ConversationList } from "./_components/ConversationList";

export default async function AskHomePage() {
  const session = await requirePageSession("/ask");
  const conversations = await listOwnedConversations({
    workspaceId: session.workspaceId,
    userId: session.userId,
  });

  return (
    <AskWorkspace sidebar={<ConversationList rows={conversations} />}>
      <AskPanel key="new" />
    </AskWorkspace>
  );
}
