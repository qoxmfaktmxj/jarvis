// packages/search/facet-counter.ts
import { buildKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type { SearchFacets } from './types.js';

/**
 * Count knowledge_page rows matching the tsquery, grouped by page_type and sensitivity.
 * Used to populate the facet filter sidebar.
 *
 * Runs two GROUP BY queries in parallel for performance.
 */
export async function countFacets(
  workspaceId: string,
  tsqueryExpr: string,
  userPermissions: string[] = [],
): Promise<SearchFacets> {
  const sensitivityFilter = buildKnowledgeSensitivitySqlFilter(userPermissions);

  const [pageTypeRows, sensitivityRows] = await Promise.all([
    db.execute<{ page_type: string; count: string }>(sql`
      SELECT
        page_type,
        COUNT(*)::text AS count
      FROM knowledge_page
      WHERE
        workspace_id = ${workspaceId}::uuid
        AND search_vector @@ ${sql.raw(tsqueryExpr)}
        AND publish_status != 'deleted'
        ${sql.raw(sensitivityFilter)}
      GROUP BY page_type
      ORDER BY count DESC
    `),
    db.execute<{ sensitivity: string; count: string }>(sql`
      SELECT
        sensitivity,
        COUNT(*)::text AS count
      FROM knowledge_page
      WHERE
        workspace_id = ${workspaceId}::uuid
        AND search_vector @@ ${sql.raw(tsqueryExpr)}
        AND publish_status != 'deleted'
        ${sql.raw(sensitivityFilter)}
      GROUP BY sensitivity
      ORDER BY count DESC
    `),
  ]);

  const byPageType: Record<string, number> = {};
  for (const row of pageTypeRows.rows) {
    byPageType[row.page_type] = parseInt(row.count, 10);
  }

  const bySensitivity: Record<string, number> = {};
  for (const row of sensitivityRows.rows) {
    bySensitivity[row.sensitivity] = parseInt(row.count, 10);
  }

  return { byPageType, bySensitivity };
}
