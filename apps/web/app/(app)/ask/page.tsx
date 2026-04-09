import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, count, sql } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { searchLog } from "@jarvis/db/schema";
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

export default async function AskPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;

  if (!session) {
    redirect("/login");
  }

  const popularQuestions = await getPopularQuestions(session.workspaceId);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Ask AI</h1>
          <p className="text-xs text-muted-foreground">
            지식 베이스 기반 AI 답변, 출처 인용, 실시간 스트리밍
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <AskPanel popularQuestions={popularQuestions} />
      </Suspense>
    </div>
  );
}
