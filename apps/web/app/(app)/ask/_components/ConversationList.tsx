import type { ConversationSummary } from "@/lib/server/conversation-repository";
import { ConversationListClient } from "./ConversationListClient";

export function ConversationList({
  rows,
  activeConversationId,
}: {
  rows: ConversationSummary[];
  activeConversationId?: string;
}) {
  return <ConversationListClient rows={rows} activeConversationId={activeConversationId} />;
}
