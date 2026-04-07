import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { searchLog, popularSearch } from '@jarvis/db/schema/search';
import { sql } from 'drizzle-orm';

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  return sunday.toISOString().split('T')[0]!;
}

export async function aggregatePopularHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
): Promise<void> {
  const period = currentWeekStart();
  console.log(`[aggregate-popular] Aggregating search_log for week starting ${period}`);

  // Aggregate last 7 days of searches grouped by (workspaceId, query)
  const rows = await db.execute<{ workspace_id: string; query: string; cnt: string }>(sql`
    SELECT workspace_id, query, COUNT(*) AS cnt
    FROM search_log
    WHERE created_at > now() - interval '7 days'
    GROUP BY workspace_id, query
    ORDER BY cnt DESC
    LIMIT 100
  `);

  if (rows.rows.length === 0) {
    console.log('[aggregate-popular] No search data found');
    return;
  }

  // Upsert into popular_search keyed by (workspaceId, query, period)
  for (const row of rows.rows) {
    await db
      .insert(popularSearch)
      .values({
        workspaceId: row.workspace_id,
        query: row.query,
        count: parseInt(row.cnt, 10),
        period,
      })
      .onConflictDoNothing();
  }

  console.log(`[aggregate-popular] Upserted ${rows.rows.length} popular searches for ${period}`);
}
