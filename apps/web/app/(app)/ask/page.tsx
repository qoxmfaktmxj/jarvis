import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { canAccessGraphSnapshotSensitivity } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import { searchLog } from "@jarvis/db/schema";
import { graphSnapshot } from "@jarvis/db/schema/graph";
import { AskPanel } from "@/components/ai/AskPanel";

async function getPopularQuestions(workspaceId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({
        query: searchLog.query,
        cnt: count(searchLog.id),
      })
      .from(searchLog)
      // noise 필터:
      //  - length > 5: 너무 짧은 키워드 제외
      //  - query ~ '[가-힣a-zA-Z]{3,}': 의미 있는 완성형 한글/알파벳 3자 이상 연속.
      //    한글 자모만 입력된 IME 사고("ㄴㅇㄹㄴㅇㄹ" 등)나 무의미 입력 제외.
      .where(sql`workspace_id = ${workspaceId}::uuid AND query IS NOT NULL AND length(query) > 5 AND query ~ '[가-힣a-zA-Z]{3,}'`)
      .groupBy(searchLog.query)
      // 최소 3회 이상 검색된 query만 — 1~2회는 우연/실험성 검색일 가능성.
      .having(sql`count(*) >= 3`)
      .orderBy(desc(count(searchLog.id)))
      .limit(5);

    return rows.map((row) => row.query).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

interface Props {
  searchParams: Promise<{ q?: string; snapshot?: string }>;
}

export default async function AskPage({ searchParams }: Props) {
  const t = await getTranslations("Ask");
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;

  if (!session) {
    redirect("/login");
  }

  const { q, snapshot: snapshotIdParam } = await searchParams;
  const popularQuestions = await getPopularQuestions(session.workspaceId);

  const canReadGraph =
    session.permissions.includes('graph:read') ||
    session.permissions.includes('admin:all');

  let initialScope: { id: string; title: string } | null = null;
  if (snapshotIdParam && canReadGraph) {
    try {
      const [row] = await db
        .select({
          id: graphSnapshot.id,
          title: graphSnapshot.title,
          sensitivity: graphSnapshot.sensitivity,
          buildStatus: graphSnapshot.buildStatus,
        })
        .from(graphSnapshot)
        .where(
          and(
            eq(graphSnapshot.id, snapshotIdParam),
            eq(graphSnapshot.workspaceId, session.workspaceId),
            eq(graphSnapshot.buildStatus, 'done'),
          ),
        )
        .limit(1);
      if (row && canAccessGraphSnapshotSensitivity(session.permissions, row.sensitivity)) {
        initialScope = { id: row.id, title: row.title };
      }
    } catch {
      // invalid uuid or DB issue — fall through with null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-6 pb-4 pt-4">
      <div className="flex items-baseline gap-3 border-b border-surface-200 pb-3 mb-3">
        <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-isu-600">
          Ask AI
        </p>
        <h1 className="text-display text-base font-semibold tracking-tight text-surface-900">
          {t("title")}
        </h1>
        <span className="text-xs text-surface-400">·</span>
        <p className="truncate text-xs text-surface-500">
          {t("subtitle")}
        </p>
      </div>

      <Suspense fallback={null}>
        <AskPanel
          initialQuestion={q ?? ""}
          initialScope={initialScope}
          popularQuestions={popularQuestions}
          conversationId={undefined}
          workspaceId={session.workspaceId}
        />
      </Suspense>
    </div>
  );
}
