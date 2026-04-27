import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { chatMessage, chatReaction, user, userSession } from "@jarvis/db/schema";
import {
  CHAT_REACTION_EMOJIS,
  type ChatReactionEmoji
} from "@jarvis/shared/constants/chat";

export interface ChatMessageRow {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface ReactionAggregate {
  emoji: ChatReactionEmoji;
  count: number;
  mine: boolean;
}

export function aggregateReactions(
  rows: Array<{
    messageId: string;
    userId: string;
    emoji: ChatReactionEmoji;
  }>,
  viewerId: string
): Map<string, ReactionAggregate[]> {
  const byMsg = new Map<
    string,
    Map<ChatReactionEmoji, { count: number; mine: boolean }>
  >();
  for (const row of rows) {
    const emojiMap = byMsg.get(row.messageId) ?? new Map();
    const prev = emojiMap.get(row.emoji) ?? { count: 0, mine: false };
    emojiMap.set(row.emoji, {
      count: prev.count + 1,
      mine: prev.mine || row.userId === viewerId
    });
    byMsg.set(row.messageId, emojiMap);
  }
  const result = new Map<string, ReactionAggregate[]>();
  for (const [msgId, emojiMap] of byMsg) {
    const ordered: ReactionAggregate[] = [];
    for (const e of CHAT_REACTION_EMOJIS) {
      const entry = emojiMap.get(e);
      if (entry) ordered.push({ emoji: e, ...entry });
    }
    result.set(msgId, ordered);
  }
  return result;
}

export async function listRecentChatMessages(
  workspaceId: string,
  viewerId: string,
  limit = 50,
  database: typeof db = db
): Promise<Array<ChatMessageRow & { reactions: ReactionAggregate[] }>> {
  const messages = await database
    .select({
      id: chatMessage.id,
      workspaceId: chatMessage.workspaceId,
      userId: chatMessage.userId,
      userName: user.name,
      avatarUrl: user.avatarUrl,
      body: chatMessage.body,
      deletedAt: chatMessage.deletedAt,
      createdAt: chatMessage.createdAt
    })
    .from(chatMessage)
    .innerJoin(user, eq(chatMessage.userId, user.id))
    .where(eq(chatMessage.workspaceId, workspaceId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(limit);

  const ids = messages.map((m) => m.id);
  const reactions =
    ids.length === 0
      ? []
      : await database
          .select({
            messageId: chatReaction.messageId,
            userId: chatReaction.userId,
            emoji: chatReaction.emoji
          })
          .from(chatReaction)
          .where(inArray(chatReaction.messageId, ids))
          .orderBy(asc(chatReaction.createdAt));

  const rxMap = aggregateReactions(
    reactions as Array<{
      messageId: string;
      userId: string;
      emoji: ChatReactionEmoji;
    }>,
    viewerId
  );

  return messages
    .reverse() // oldest first for UI
    .map((m) => ({
      ...m,
      reactions: rxMap.get(m.id) ?? []
    })) as Array<ChatMessageRow & { reactions: ReactionAggregate[] }>;
}

export async function getMessageById(
  id: string,
  database: typeof db = db
): Promise<ChatMessageRow | null> {
  const row = await database
    .select({
      id: chatMessage.id,
      workspaceId: chatMessage.workspaceId,
      userId: chatMessage.userId,
      userName: user.name,
      avatarUrl: user.avatarUrl,
      body: chatMessage.body,
      deletedAt: chatMessage.deletedAt,
      createdAt: chatMessage.createdAt
    })
    .from(chatMessage)
    .innerJoin(user, eq(chatMessage.userId, user.id))
    .where(eq(chatMessage.id, id))
    .limit(1);

  return (row[0] as ChatMessageRow | undefined) ?? null;
}

export async function getReactionsForMessage(
  messageId: string,
  viewerId: string,
  database: typeof db = db
): Promise<ReactionAggregate[]> {
  const rows = await database
    .select({
      messageId: chatReaction.messageId,
      userId: chatReaction.userId,
      emoji: chatReaction.emoji
    })
    .from(chatReaction)
    .where(eq(chatReaction.messageId, messageId));

  return (
    aggregateReactions(
      rows as Array<{
        messageId: string;
        userId: string;
        emoji: ChatReactionEmoji;
      }>,
      viewerId
    ).get(messageId) ?? []
  );
}

/**
 * user_session 스키마 적응:
 * 실제 컬럼: id, data (JSONB), expiresAt.
 * workspaceId / userId / updatedAt 컬럼 없음.
 * online 기준 = 세션이 아직 만료되지 않음(expiresAt > now()) +
 * data->>'workspaceId' 일치 + distinct data->>'userId' 카운트.
 */
export async function countOnlineUsers(
  workspaceId: string,
  _windowMinutes: number,
  database: typeof db = db
): Promise<number> {
  const now = new Date();
  const rows = await database
    .select({
      c: sql<string>`count(distinct ${userSession.data}->>'userId')`
    })
    .from(userSession)
    .where(
      and(
        sql`${userSession.data}->>'workspaceId' = ${workspaceId}`,
        sql`${userSession.expiresAt} > ${now}`
      )
    );
  return Number(rows[0]?.c ?? 0);
}
