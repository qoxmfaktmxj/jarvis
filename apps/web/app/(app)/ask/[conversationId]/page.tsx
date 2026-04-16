import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, asc, eq, desc, count, sql } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { getSession } from "@jarvis/auth/session";
import { canAccessGraphSnapshotSensitivity } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import {
  askConversation,
  askMessage,
} from "@jarvis/db/schema/ask-conversation";
import { searchLog } from "@jarvis/db/schema";
import { graphSnapshot } from "@jarvis/db/schema/graph";
import type { SourceRef } from "@jarvis/ai/types";
import { AskPanel } from "@/components/ai/AskPanel";

/** 대화 메시지를 AskPanel의 HistoryEntry 형태로 변환 */
interface HistoryEntry {
  question: string;
  answer: string;
  sources: SourceRef[];
}

function messagesToHistory(
  messages: { role: string; content: string; sources: unknown }[],
): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  let currentQuestion: string | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      currentQuestion = msg.content;
    } else if (msg.role === "assistant" && currentQuestion) {
      history.push({
        question: currentQuestion,
        answer: msg.content,
        sources: (msg.sources as SourceRef[] | null) ?? [],
      });
      currentQuestion = null;
    }
  }

  return history;
}

async function getPopularQuestions(workspaceId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({
        query: searchLog.query,
        cnt: count(searchLog.id),
      })
      .from(searchLog)
      .where(
        sql`workspace_id = ${workspaceId}::uuid AND query IS NOT NULL AND length(query) > 5`,
      )
      .groupBy(searchLog.query)
      .orderBy(desc(count(searchLog.id)))
      .limit(5);

    return rows.map((row) => row.query).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const t = await getTranslations("Ask");
  const headerStore = await headers();
  const cookieStore = await cookies();
  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value;

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect("/login");
  }

  const { conversationId } = await params;

  /* ── 대화 존재 확인 + 소유권 검증 ──────────────────── */
  const [conversation] = await db
    .select()
    .from(askConversation)
    .where(
      and(
        eq(askConversation.id, conversationId),
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .limit(1);

  if (!conversation) {
    notFound();
  }

  /* ── 메시지 로드 ───────────────────────────────────── */
  const messages = await db
    .select({
      role: askMessage.role,
      content: askMessage.content,
      sources: askMessage.sources,
    })
    .from(askMessage)
    .where(eq(askMessage.conversationId, conversationId))
    .orderBy(asc(askMessage.sortOrder));

  const initialMessages = messagesToHistory(
    messages as { role: string; content: string; sources: unknown }[],
  );

  /* ── 그래프 스코프 복원 ────────────────────────────── */
  const canReadGraph =
    session.permissions.includes("graph:read") ||
    session.permissions.includes("admin:all");

  let initialScope: { id: string; title: string } | null = null;
  if (conversation.snapshotId && canReadGraph) {
    try {
      const [row] = await db
        .select({
          id: graphSnapshot.id,
          title: graphSnapshot.title,
          sensitivity: graphSnapshot.sensitivity,
        })
        .from(graphSnapshot)
        .where(
          and(
            eq(graphSnapshot.id, conversation.snapshotId),
            eq(graphSnapshot.workspaceId, session.workspaceId),
          ),
        )
        .limit(1);
      if (
        row &&
        canAccessGraphSnapshotSensitivity(session.permissions, row.sensitivity)
      ) {
        initialScope = { id: row.id, title: row.title };
      }
    } catch {
      // invalid uuid or DB issue
    }
  }

  const popularQuestions = await getPopularQuestions(session.workspaceId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">
            {conversation.title}
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <AskPanel
          initialQuestion=""
          initialScope={initialScope}
          popularQuestions={popularQuestions}
          conversationId={conversationId}
          initialMessages={initialMessages}
        />
      </Suspense>
    </div>
  );
}
