import { AnswerCard } from "@/components/ai/AnswerCard";
import type { OwnedConversation } from "@/lib/server/conversation-repository";

export function ConversationView({ conversation }: { conversation: OwnedConversation | null }) {
  if (!conversation) {
    return null;
  }

  return (
    <div className="space-y-4">
      {conversation.messages.map((message) =>
        message.role === "assistant" ? (
          <AnswerCard
            key={message.id}
            text={message.content}
            sources={message.citations as Parameters<typeof AnswerCard>[0]["sources"]}
          />
        ) : (
          <div key={message.id} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]">
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          </div>
        ),
      )}
    </div>
  );
}
