// packages/search/facet-counter.ts
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type { SearchFacets } from './types.js';

/**
 * Count knowledge_page rows matching the tsquery, grouped by page_type.
 * Used to populate the facet filter sidebar.
 *
 * 2026-05-11: knowledge_page.sensitivity 컬럼 제거. sensitivity facet 폐지.
 * `bySensitivity` 는 호환을 위해 빈 객체로 반환.
 */
export async function countFacets(
  workspaceId: string,
  tsqueryExpr: string,
  _userPermissions: string[] = [],
): Promise<SearchFacets> {
  const tsquerySql = sql.raw(tsqueryExpr);

  const pageTypeRows = await db.execute<{ page_type: string; count: string }>(sql`
    SELECT
      page_type,
      COUNT(*)::text AS count
    FROM knowledge_page
    WHERE
      workspace_id = ${workspaceId}::uuid
      AND search_vector @@ ${tsquerySql}
      AND publish_status != 'deleted'
    GROUP BY page_type
    ORDER BY count DESC
  `);

  const byPageType: Record<string, number> = {};
  for (const row of pageTypeRows.rows) {
    byPageType[row.page_type] = parseInt(row.count, 10);
  }

  return { byPageType, bySensitivity: {} };
}
