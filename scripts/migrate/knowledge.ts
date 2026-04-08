// scripts/migrate/knowledge.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyInfraPage } from './types';

export async function migrateKnowledge(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  // TMAN_INFRA_PAGE holds wiki-style content attached to TMAN_INFRA_MANAGE systems.
  const result = await oracle.execute<LegacyInfraPage>(
    `SELECT ENTER_CD, SEQ, MANAGE_SEQ, PAGE_CONTENT, CHK_DATE, CHK_ID
     FROM TMAN_INFRA_PAGE ${whereClause} ORDER BY ENTER_CD, MANAGE_SEQ, SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} TMAN_INFRA_PAGE rows`);

  for (const row of rows) {
    const pageId = randomUUID();
    const versionId = randomUUID();
    idMap.set('knowledge_page', `${row.ENTER_CD}:${row.SEQ}`, pageId);

    const workspaceId = idMap.require('workspace', row.ENTER_CD);
    const systemId = idMap.get('system', `${row.ENTER_CD}:${row.MANAGE_SEQ}`) ?? null;
    const authorId = row.CHK_ID
      ? (idMap.get('user', `${row.ENTER_CD}:${row.CHK_ID}`) ?? null)
      : null;
    const updatedAt = row.CHK_DATE instanceof Date ? row.CHK_DATE : new Date();

    if (!opts.isDryRun) {
      // knowledge_page
      await pg.query(
        `INSERT INTO knowledge_page (id, workspace_id, system_id, page_type, publish_status, created_at, updated_at)
         VALUES ($1, $2, $3, 'system', 'published', NOW(), $4)
         ON CONFLICT (id) DO NOTHING`,
        [pageId, workspaceId, systemId, updatedAt],
      );

      // knowledge_page_version (initial version with legacy content as MDX)
      await pg.query(
        `INSERT INTO knowledge_page_version (id, page_id, version, content, author_id, created_at)
         VALUES ($1, $2, 1, $3, $4, $5)
         ON CONFLICT (page_id, version) DO UPDATE SET content = EXCLUDED.content`,
        [versionId, pageId, row.PAGE_CONTENT ?? '', authorId, updatedAt],
      );
    } else {
      console.log(
        `  [dry-run] knowledge_page: ENTER_CD=${row.ENTER_CD} SEQ=${row.SEQ}` +
        ` systemId=${systemId ?? 'none'} contentLen=${row.PAGE_CONTENT?.length ?? 0}`,
      );
    }
  }
  console.log(`  knowledge_page: ${rows.length} processed`);
}
