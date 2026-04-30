import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { searchLog, popularSearch } from '@jarvis/db/schema/search';
import { sql } from 'drizzle-orm';

/**
 * Code review LOW I — 원본 Date 를 변형하지 않도록 immutable 구현으로 교체.
 * UTC 기준 일요일을 주 시작으로 사용. (KST 기준 주 시작 분리는 별도 plan.)
 */
export function currentWeekStart(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return sunday.toISOString().split('T')[0]!;
}

export async function aggregatePopularHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
  database: typeof db = db,
  now: Date = new Date(),
): Promise<{ inserted: number; period: string }> {
  const period = currentWeekStart(now);
  console.log(`[aggregate-popular] Aggregating search_log for week starting ${period}`);

  // Aggregate last 7 days of searches grouped by (workspaceId, query)
  const rows = await database.execute<{ workspace_id: string; query: string; cnt: string }>(sql`
    SELECT workspace_id, query, COUNT(*) AS cnt
    FROM search_log
    WHERE created_at > now() - interval '7 days'
    GROUP BY workspace_id, query
    ORDER BY cnt DESC
    LIMIT 100
  `);

  if (rows.rows.length === 0) {
    console.log('[aggregate-popular] No search data found');
    return { inserted: 0, period };
  }

  // Code review HIGH G — onConflictDoNothing() 은 PK(id) 기준 conflict 만 잡아서
  // 매 실행마다 중복 row 가 누적되거나 (UNIQUE 부재 시) 또는 카운트가 freeze 됨.
  // (workspaceId, query, period) UNIQUE 인덱스 (migration 0048) 를 conflict target 으로
  // 명시하고 count 를 최신 집계값으로 갱신한다.
  for (const row of rows.rows) {
    await database
      .insert(popularSearch)
      .values({
        workspaceId: row.workspace_id,
        query: row.query,
        count: parseInt(row.cnt, 10),
        period,
      })
      .onConflictDoUpdate({
        target: [popularSearch.workspaceId, popularSearch.query, popularSearch.period],
        set: {
          count: sql`excluded.count`,
        },
      });
  }

  console.log(`[aggregate-popular] Upserted ${rows.rows.length} popular searches for ${period}`);
  return { inserted: rows.rows.length, period };
}
