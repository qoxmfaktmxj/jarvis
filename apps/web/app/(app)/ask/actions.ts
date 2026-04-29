"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { askConversation, askMessage } from "@jarvis/db/schema";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { MAX_CONVERSATIONS_PER_USER } from "@jarvis/shared/constants/ask";
import {
  getConversationTokenUsage,
  type ConversationTokenUsage,
} from "@/lib/queries/ask-context-usage";

// ---------------------------------------------------------------------------
// Session resolver (profile.ts 패턴 재사용)
// ---------------------------------------------------------------------------

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

async function requireSession() {
  const sessionId = await resolveSessionId();
  if (!sessionId) throw new Error("Unauthorized");

  const session = await getSession(sessionId);
  if (!session) throw new Error("Unauthorized");

  return session;
}

// ---------------------------------------------------------------------------
// getConversations — 현재 사용자의 대화 목록 (lastMessageAt DESC) + count
// ---------------------------------------------------------------------------

export interface GetConversationsResult {
  conversations: {
    id: string;
    title: string;
    messageCount: number;
    lastMessageAt: string | null; // ISO string
    createdAt: string;            // ISO string
  }[];
  total: number;
}

export async function getConversations(): Promise<GetConversationsResult> {
  const session = await requireSession();

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: askConversation.id,
        title: askConversation.title,
        messageCount: askConversation.messageCount,
        lastMessageAt: askConversation.lastMessageAt,
        createdAt: askConversation.createdAt,
      })
      .from(askConversation)
      .where(
        and(
          eq(askConversation.workspaceId, session.workspaceId),
          eq(askConversation.userId, session.userId),
        ),
      )
      .orderBy(desc(askConversation.lastMessageAt)),
    db
      .select({ count: count() })
      .from(askConversation)
      .where(
        and(
          eq(askConversation.workspaceId, session.workspaceId),
          eq(askConversation.userId, session.userId),
        ),
      ),
  ]);

  return {
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: r.messageCount,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// getConversationMessages — 특정 대화의 메시지 로드 (workspace+user 이중 검증)
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  sources: unknown[];
  lane: string | null;
  totalTokens: number | null;
  sortOrder: number;
  createdAt: string; // ISO string
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const session = await requireSession();

  // 소유권 검증: workspace + user 이중 체크
  const [conv] = await db
    .select({ id: askConversation.id })
    .from(askConversation)
    .where(
      and(
        eq(askConversation.id, conversationId),
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .limit(1);

  if (!conv) {
    throw new Error("Conversation not found");
  }

  const rows = await db
    .select({
      id: askMessage.id,
      role: askMessage.role,
      content: askMessage.content,
      sources: askMessage.sources,
      lane: askMessage.lane,
      totalTokens: askMessage.totalTokens,
      sortOrder: askMessage.sortOrder,
      createdAt: askMessage.createdAt,
    })
    .from(askMessage)
    .where(eq(askMessage.conversationId, conversationId))
    .orderBy(asc(askMessage.sortOrder));

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    sources: (r.sources ?? []) as unknown[],
    lane: r.lane,
    totalTokens: r.totalTokens,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// deleteConversation — 대화 삭제 (소유권 검증)
// ---------------------------------------------------------------------------

export async function deleteConversation(
  conversationId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const deleted = await db
    .delete(askConversation)
    .where(
      and(
        eq(askConversation.id, conversationId),
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .returning({ id: askConversation.id });

  if (deleted.length === 0) {
    return { success: false, error: "Conversation not found" };
  }

  revalidatePath("/ask");
  return { success: true };
}

// ---------------------------------------------------------------------------
// renameConversation — 대화 제목 수정
// ---------------------------------------------------------------------------

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200) {
    return { success: false, error: "Title must be 1-200 characters" };
  }

  const session = await requireSession();

  const updated = await db
    .update(askConversation)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(
      and(
        eq(askConversation.id, conversationId),
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .returning({ id: askConversation.id });

  if (updated.length === 0) {
    return { success: false, error: "Conversation not found" };
  }

  revalidatePath("/ask");
  return { success: true };
}

// ---------------------------------------------------------------------------
// evictOldConversations — 20개 초과 시 가장 오래된 것 삭제 (session 기반, IDOR 차단)
// - requireSession()으로 session 검증 후 session.workspaceId/userId만 사용
// - db.transaction + pg_advisory_xact_lock으로 TOCTOU race 방지
// ---------------------------------------------------------------------------

export async function evictOldConversations(
  opts?: { excludeId?: string },
): Promise<void> {
  const session = await requireSession();
  const { workspaceId, userId } = session;
  const excludeId = opts?.excludeId;

  await db.transaction(async (tx) => {
    // workspaceId+userId 조합으로 advisory lock — 동일 사용자 동시 호출 직렬화
    const lockKey = `${workspaceId}:${userId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [countRow] = await tx
      .select({ count: count() })
      .from(askConversation)
      .where(
        and(
          eq(askConversation.workspaceId, workspaceId),
          eq(askConversation.userId, userId),
        ),
      );

    const total = countRow?.count ?? 0;
    if (total < MAX_CONVERSATIONS_PER_USER) return;

    const toDelete = total - (MAX_CONVERSATIONS_PER_USER - 1); // 1자리 비우기

    const conditions = [
      eq(askConversation.workspaceId, workspaceId),
      eq(askConversation.userId, userId),
    ];
    if (excludeId) {
      conditions.push(ne(askConversation.id, excludeId));
    }

    const oldest = await tx
      .select({ id: askConversation.id })
      .from(askConversation)
      .where(and(...conditions))
      .orderBy(asc(askConversation.lastMessageAt))
      .limit(toDelete);

    if (oldest.length > 0) {
      await tx
        .delete(askConversation)
        .where(inArray(askConversation.id, oldest.map((r) => r.id)));
    }
  });
}

// ---------------------------------------------------------------------------
// getConversationTokenUsageAction — Ask Panel toolbar context gauge 전용.
// 소유권 확인 후 ask_message.totalTokens SUM 반환.
// ---------------------------------------------------------------------------

export async function getConversationTokenUsageAction(
  conversationId: string,
): Promise<ConversationTokenUsage> {
  const session = await requireSession();

  const [owned] = await db
    .select({ id: askConversation.id })
    .from(askConversation)
    .where(
      and(
        eq(askConversation.id, conversationId),
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .limit(1);

  if (!owned) {
    return { conversationId, usedTokens: 0, messageCount: 0 };
  }

  return getConversationTokenUsage(conversationId);
}
