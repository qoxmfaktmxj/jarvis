// scripts/migrate/audit-logs.ts
// TSYS_LOG can have 100k+ rows. Use large batch inserts.
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyAuditLog } from './types';

const BATCH_SIZE = 500;

// Map legacy Oracle action codes to Jarvis audit action strings.
const ACTION_CODE_MAP: Record<string, string> = {
  I: 'INSERT',
  U: 'UPDATE',
  D: 'DELETE',
  L: 'LOGIN',
  O: 'LOGOUT',
  V: 'VIEW',
};

export async function migrateAuditLogs(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  // Fetch in pages to avoid OOM on large TSYS_LOG tables
  let offset = 0;
  let totalInserted = 0;

  while (true) {
    const result = await oracle.execute<LegacyAuditLog>(
      `SELECT LOG_ID, ENTER_CD, SABUN, LOG_DATE, ACTION_CD, TARGET_TABLE, TARGET_ID, IP_ADDR, DETAIL
       FROM TSYS_LOG ${whereClause}
       ORDER BY LOG_ID
       OFFSET ${offset} ROWS FETCH NEXT ${BATCH_SIZE} ROWS ONLY`,
      bindParams,
    );
    const rows = result.rows ?? [];
    if (rows.length === 0) break;

    if (!opts.isDryRun) {
      for (const row of rows) {
        const userId = row.SABUN
          ? (idMap.get('user', `${row.ENTER_CD}:${row.SABUN}`) ?? null)
          : null;
        const workspaceId = idMap.get('workspace', row.ENTER_CD) ?? null;
        const action = ACTION_CODE_MAP[row.ACTION_CD?.toUpperCase()] ?? row.ACTION_CD;

        await pg.query(
          `INSERT INTO audit_log (id, workspace_id, user_id, action, target_table, target_id, ip_addr, detail, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            randomUUID(), workspaceId, userId, action,
            row.TARGET_TABLE ?? null, row.TARGET_ID ?? null,
            row.IP_ADDR ?? null, row.DETAIL ?? null,
            row.LOG_DATE ?? new Date(),
          ],
        );
        totalInserted++;
      }
    } else if (offset === 0) {
      // Only log once for dry-run
      console.log(`  [dry-run] audit_log: would insert ${rows.length}+ rows (sampled first batch)`);
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;  // last page

    if (offset % 10000 === 0) {
      console.log(`  audit_log: processed ${offset} rows...`);
    }
  }
  console.log(`  audit_log: ${opts.isDryRun ? offset : totalInserted} processed`);
}
