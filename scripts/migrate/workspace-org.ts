// scripts/migrate/workspace-org.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyOrg } from './types';

export async function migrateWorkspaceOrg(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  // ── 1. Workspaces ──────────────────────────────────────────────────────────
  const wsResult = await oracle.execute<{ ENTER_CD: string }>(
    `SELECT DISTINCT ENTER_CD FROM TSYS305_NEW ORDER BY ENTER_CD`,
  );
  const workspaceRows = wsResult.rows ?? [];
  console.log(`  oracle: ${workspaceRows.length} distinct ENTER_CD values`);

  for (const row of workspaceRows) {
    const newId = randomUUID();
    idMap.set('workspace', row.ENTER_CD, newId);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO workspace (id, code, name, created_at, updated_at)
         VALUES ($1, $2, $2, NOW(), NOW())
         ON CONFLICT (code) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [newId, row.ENTER_CD],
      );
    } else {
      console.log(`  [dry-run] workspace: ${row.ENTER_CD} → ${newId}`);
    }
  }
  console.log(`  workspaces: ${idMap.count('workspace')} upserted`);

  // ── 2. Organizations ───────────────────────────────────────────────────────
  const orgResult = await oracle.execute<LegacyOrg>(
    `SELECT DISTINCT ENTER_CD, ORG_CD, ORG_NM FROM TSYS305_NEW
     WHERE ORG_CD IS NOT NULL ORDER BY ENTER_CD, ORG_CD`,
  );
  const orgRows = orgResult.rows ?? [];
  console.log(`  oracle: ${orgRows.length} distinct organizations`);

  for (const row of orgRows) {
    const newId = randomUUID();
    const workspaceId = idMap.require('workspace', row.ENTER_CD);
    idMap.set('org', `${row.ENTER_CD}:${row.ORG_CD}`, newId);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO organization (id, workspace_id, code, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (workspace_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
        [newId, workspaceId, row.ORG_CD, row.ORG_NM],
      );
    } else {
      console.log(`  [dry-run] org: ${row.ENTER_CD}/${row.ORG_CD} "${row.ORG_NM}" → ${newId}`);
    }
  }
  console.log(`  organizations: ${idMap.count('org')} upserted`);
}
