// scripts/migrate/files.ts
// Migrates TCOM_FILE records. Actual binary transfer to MinIO is a separate
// operational step (use mc mirror or rclone). This module records the mapping
// so foreign keys in other tables resolve correctly.
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyFile } from './types';

const BATCH_SIZE = 100;

export async function migrateFiles(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyFile>(
    `SELECT ENTER_CD, FILE_SEQ, FILE_NM, FILE_PATH, FILE_SIZE, FILE_EXT, CHK_ID, CHK_DATE
     FROM TCOM_FILE ${whereClause} ORDER BY ENTER_CD, FILE_SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} TCOM_FILE rows`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const newId = randomUUID();
      // Key by enterCd + fileSeq per design spec
      idMap.set('raw_source', `${row.ENTER_CD}:${row.FILE_SEQ}`, newId);
      const workspaceId = idMap.require('workspace', row.ENTER_CD);

      // MinIO path convention: jarvis-files/<workspaceCode>/<fileSeq>/<fileName>
      const minioPath = `jarvis-files/${row.ENTER_CD}/${row.FILE_SEQ}/${row.FILE_NM}`;

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO raw_source (id, workspace_id, legacy_file_seq, file_name, minio_path, file_size, file_ext, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (workspace_id, legacy_file_seq) DO UPDATE
             SET minio_path = EXCLUDED.minio_path, updated_at = NOW()`,
          [newId, workspaceId, row.FILE_SEQ, row.FILE_NM, minioPath, row.FILE_SIZE ?? 0, row.FILE_EXT ?? null],
        );
      } else {
        console.log(`  [dry-run] raw_source: ${row.ENTER_CD}/${row.FILE_SEQ} → ${minioPath}`);
      }
    }
  }
  console.log(`  raw_source: ${rows.length} processed`);
  console.log(`  NOTE: Actual file bytes must be transferred separately (mc mirror / rclone)`);
}
