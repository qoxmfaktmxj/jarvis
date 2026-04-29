// packages/search/facet-counter.ts
import { buildLegacyKnowledgeSensitivitySqlFragment } from '@jarvis/auth/rbac';
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
  const sensitivityFragment = buildLegacyKnowledgeSensitivitySqlFragment(userPermissions);
  // tsqueryExpr is the output of query-parser.ts (PG function call with escaped args).
  // sql.raw() is permitted here: tsqueryExpr is a closed static PG function call.
  const tsquerySql = sql.raw(tsqueryExpr);

  const [pageTypeRows, sensitivityRows] = await Promise.all([
    db.execute<{ page_type: string; count: string }>(sql`
      SELECT
        page_type,
        COUNT(*)::text AS count
      FROM knowledge_page
      WHERE
        workspace_id = ${workspaceId}::uuid
        AND search_vector @@ ${tsquerySql}
        AND publish_status != 'deleted'
        ${sensitivityFragment}
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
        AND search_vector @@ ${tsquerySql}
        AND publish_status != 'deleted'
        ${sensitivityFragment}
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
