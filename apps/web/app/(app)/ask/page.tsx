// apps/web/app/(app)/ask/page.tsx
import { Suspense } from 'react';
import { db } from '@jarvis/db/client';
import { searchLog } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, desc, count } from 'drizzle-orm';
import { AskPanel } from '@/components/ai/AskPanel';
import { Sparkles } from 'lucide-react';

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

    return rows.map((r) => r.query).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

export default async function AskPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');

  const popularQuestions = await getPopularQuestions(session.workspaceId);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Ask AI</h1>
          <p className="text-xs text-muted-foreground">
            지식 베이스 기반 AI 답변 · 출처 인용 · 실시간 스트리밍
          </p>
        </div>
      </div>

      {/* Popular questions label */}
      {popularQuestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">자주 묻는 질문</p>
        </div>
      )}

      {/* AskPanel (Client Component) */}
      <Suspense fallback={null}>
        <AskPanel popularQuestions={popularQuestions} />
      </Suspense>
    </div>
  );
}
