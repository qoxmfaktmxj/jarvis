// scripts/migrate/companies.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyCompany } from './types';

export async function migrateCompanies(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyCompany>(
    `SELECT ENTER_CD, COMPANY_CD, OBJECT_DIV, COMPANY_NM, CEO_NM, BIZ_NO, ADDR, TEL, FAX, EMAIL, USE_YN, CHK_ID, CHK_DATE
     FROM TCOM_COMPANY ${whereClause} ORDER BY ENTER_CD, COMPANY_CD`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} company rows`);

  for (const row of rows) {
    const newId = randomUUID();
    idMap.set('company', `${row.ENTER_CD}:${row.COMPANY_CD}:${row.OBJECT_DIV}`, newId);
    const workspaceId = idMap.require('workspace', row.ENTER_CD);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO company (id, workspace_id, code, object_div, name, ceo_name, biz_no, address, tel, fax, email, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         ON CONFLICT (workspace_id, code, object_div) DO UPDATE
           SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, updated_at = NOW()`,
        [
          newId, workspaceId, row.COMPANY_CD, row.OBJECT_DIV, row.COMPANY_NM,
          row.CEO_NM ?? null, row.BIZ_NO ?? null, row.ADDR ?? null,
          row.TEL ?? null, row.FAX ?? null, row.EMAIL ?? null,
          row.USE_YN === 'Y',
        ],
      );
    }
  }
  console.log(`  company: ${idMap.count('company')} processed`);
}
