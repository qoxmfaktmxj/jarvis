import { db } from "@jarvis/db/client";
import { askMessage } from "@jarvis/db/schema";
import { eq, sql } from "drizzle-orm";

export interface ConversationTokenUsage {
  conversationId: string;
  usedTokens: number;
  messageCount: number;
}

/**
 * 한 대화(ask_conversation)의 누적 토큰 사용량과 메시지 수를 반환.
 *
 * Ask AI UI의 컨텍스트 게이지 분자(usedTokens)로 사용된다.
 * `ask_message.totalTokens`는 assistant 응답의 OpenAI usage.total_tokens를
 * 그대로 저장한 값. null인 레거시 row는 COALESCE로 0 처리.
 */
export async function getConversationTokenUsage(
  conversationId: string,
): Promise<ConversationTokenUsage> {
  const rows = await db
    .select({
      totalTokens: sql<number | null>`COALESCE(SUM(${askMessage.totalTokens}), 0)::int`,
      messageCount: sql<number>`COUNT(*)::int`,
    })
    .from(askMessage)
    .where(eq(askMessage.conversationId, conversationId));

  const row = rows[0];
  return {
    conversationId,
    usedTokens: Number(row?.totalTokens ?? 0),
    messageCount: Number(row?.messageCount ?? 0),
  };
}
