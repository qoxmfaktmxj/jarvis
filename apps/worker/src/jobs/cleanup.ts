import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { searchLog } from '@jarvis/db/schema/search';
import { knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { sql, lt } from 'drizzle-orm';

export async function cleanupHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
): Promise<void> {
  console.log('[cleanup] Starting scheduled cleanup');

  // 1. Delete search_log entries older than 90 days
  const deletedLogs = await db
    .delete(searchLog)
    .where(lt(searchLog.createdAt, sql`now() - interval '90 days'`))
    .returning({ id: searchLog.id });

  console.log(`[cleanup] Deleted ${deletedLogs.length} old search_log entries`);

  // 2. Delete old knowledge_page_versions keeping only last 20 per page
  //    Uses a window function to rank versions by versionNumber DESC per page.
  const deletedVersions = await db.execute(sql`
    DELETE FROM knowledge_page_version
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY version_number DESC) AS rn
        FROM knowledge_page_version
      ) ranked
      WHERE rn > 20
    )
  `);

  const rowCount = (deletedVersions as { rowCount?: number }).rowCount ?? 0;
  console.log(
    `[cleanup] Deleted ${rowCount} old knowledge_page_version entries`,
  );
}
