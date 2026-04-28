import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, and, count } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { askConversation } from "@jarvis/db/schema/ask-conversation";
import { AskShell } from "./_components/AskShell";

/**
 * Ask 전용 레이아웃 — 사이드바(대화 목록) + 메인 영역.
 *
 * Server Component: 현재 사용자의 대화 목록을 DB에서 조회하여
 * AskSidebar에 전달하고, children을 메인 영역에 배치한다.
 *
 * NOTE: layout.tsx는 하위 라우트 파라미터(conversationId)에 직접 접근 불가.
 * 대신 x-next-pathname 헤더(middleware에서 주입) 또는 referer에서 추출한다.
 * AskSidebar는 "use client"이므로, 사이드바 자체에서 usePathname()으로
 * 현재 활성 대화를 판별하도록 위임하는 것이 더 안정적이다.
 */
export default async function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* ── 인증 ─────────────────────────────────────────────── */
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

  /* ── 대화 목록 조회 ──────────────────────────────────── */
  const conversations = await db
    .select()
    .from(askConversation)
    .where(
      and(
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    )
    .orderBy(desc(askConversation.lastMessageAt));

  const [countRow] = await db
    .select({ value: count() })
    .from(askConversation)
    .where(
      and(
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      ),
    );

  const conversationCount = countRow?.value ?? 0;

  return (
    <AskShell
      conversations={conversations}
      conversationCount={conversationCount}
      workspaceId={session.workspaceId}
    >
      {children}
    </AskShell>
  );
}
