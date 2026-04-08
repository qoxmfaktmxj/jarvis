// scripts/migrate/menu-codes.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyMenu, LegacyCodeGroup, LegacyCodeItem } from './types';

const BATCH_SIZE = 100;

export async function migrateMenuCodes(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  await migrateMenuItems(oracle, pg, idMap, opts);
  await migrateCodeGroups(oracle, pg, idMap, opts);
  await migrateCodeItems(oracle, pg, idMap, opts);
}

async function migrateMenuItems(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  // Fetch all menu items; order by depth so parents are inserted first.
  // CONNECT BY PRIOR is Oracle-specific; approximate with LEVEL sort.
  const result = await oracle.execute<LegacyMenu>(
    `SELECT ENTER_CD, MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_URL, MENU_ORDER, USE_YN, ICON, CHK_ID, CHK_DATE
     FROM TSYS301_NEW ${whereClause}
     ORDER BY ENTER_CD, PARENT_MENU_ID NULLS FIRST, MENU_ORDER`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} menu rows`);

  for (const row of rows) {
    const newId = randomUUID();
    idMap.set('menu', `${row.ENTER_CD}:${row.MENU_ID}`, newId);

    const workspaceId = idMap.require('workspace', row.ENTER_CD);

    // parentMenuId = null, '0', or '' means root
    const isRoot =
      !row.PARENT_MENU_ID ||
      row.PARENT_MENU_ID === '0' ||
      row.PARENT_MENU_ID === '';
    const parentId = isRoot
      ? null
      : (idMap.get('menu', `${row.ENTER_CD}:${row.PARENT_MENU_ID}`) ?? null);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO menu_item (id, workspace_id, menu_id, name, url, parent_id, sort_order, is_active, icon, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (workspace_id, menu_id) DO UPDATE
           SET name = EXCLUDED.name,
               url = EXCLUDED.url,
               parent_id = EXCLUDED.parent_id,
               sort_order = EXCLUDED.sort_order,
               is_active = EXCLUDED.is_active,
               updated_at = NOW()`,
        [
          newId, workspaceId, row.MENU_ID, row.MENU_NM,
          row.MENU_URL ?? null, parentId, row.MENU_ORDER ?? 0,
          row.USE_YN === 'Y', row.ICON ?? null,
        ],
      );
    } else {
      console.log(`  [dry-run] menu: ${row.MENU_ID} "${row.MENU_NM}" parent=${parentId ?? 'root'}`);
    }
  }
  console.log(`  menu_item: ${idMap.count('menu')} processed`);
}

async function migrateCodeGroups(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyCodeGroup>(
    `SELECT ENTER_CD, GRCODE_CD, GRCODE_NM, USE_YN, SORT_ORDER, CHK_ID, CHK_DATE
     FROM TSYS005_NEW ${whereClause} GROUP BY ENTER_CD, GRCODE_CD, GRCODE_NM, USE_YN, SORT_ORDER, CHK_ID, CHK_DATE
     ORDER BY ENTER_CD, SORT_ORDER`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} code group rows`);

  for (const row of rows) {
    const newId = randomUUID();
    idMap.set('code_group', `${row.ENTER_CD}:${row.GRCODE_CD}`, newId);
    const workspaceId = idMap.require('workspace', row.ENTER_CD);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO code_group (id, workspace_id, code, name, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (workspace_id, code) DO UPDATE
           SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, updated_at = NOW()`,
        [newId, workspaceId, row.GRCODE_CD, row.GRCODE_NM, row.SORT_ORDER ?? 0, row.USE_YN === 'Y'],
      );
    }
  }
  console.log(`  code_group: ${idMap.count('code_group')} processed`);
}

async function migrateCodeItems(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyCodeItem>(
    `SELECT ENTER_CD, GRCODE_CD, CODE, CODE_NM, USE_YN, SORT_ORDER, ETC1, ETC2, ETC3, CHK_ID, CHK_DATE
     FROM TSYS005_NEW ${whereClause} ORDER BY ENTER_CD, GRCODE_CD, SORT_ORDER`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} code item rows`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const newId = randomUUID();
      const groupId = idMap.require('code_group', `${row.ENTER_CD}:${row.GRCODE_CD}`);

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO code_item (id, group_id, code, name, sort_order, is_active, etc1, etc2, etc3, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           ON CONFLICT (group_id, code) DO UPDATE
             SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, updated_at = NOW()`,
          [newId, groupId, row.CODE, row.CODE_NM, row.SORT_ORDER ?? 0, row.USE_YN === 'Y',
           row.ETC1 ?? null, row.ETC2 ?? null, row.ETC3 ?? null],
        );
      }
    }
  }
  console.log(`  code_item: ${rows.length} processed`);
}
