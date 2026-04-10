import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { Sparkles } from "lucide-react";
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
      .where(sql`workspace_id = ${workspaceId}::uuid AND query IS NOT NULL AND length(query) > 5`)
      .groupBy(searchLog.query)
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
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">
            지식 베이스 기반 AI 답변, 출처 인용, 실시간 스트리밍
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <AskPanel
          initialQuestion={q ?? ""}
          initialScope={initialScope}
          popularQuestions={popularQuestions}
        />
      </Suspense>
    </div>
  );
}
