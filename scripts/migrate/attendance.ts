// scripts/migrate/attendance.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyAttendance, LegacyOutManage, LegacyOutManageTime } from './types';

const BATCH_SIZE = 100;

export async function migrateAttendance(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  await migrateAttendanceRecords(oracle, pg, idMap, opts);
  await migrateOutManage(oracle, pg, idMap, opts);
  await migrateOutManageTime(oracle, pg, idMap, opts);
}

async function migrateAttendanceRecords(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyAttendance>(
    `SELECT ENTER_CD, SEQ, SABUN, ATTEND_DATE, ATTEND_TYPE_CD, IN_TIME, OUT_TIME, REASON, CHK_ID, CHK_DATE
     FROM TMAN_ATTENDANCE ${whereClause} ORDER BY ENTER_CD, SABUN, ATTEND_DATE`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} attendance rows`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const newId = randomUUID();
      idMap.set('attendance', `${row.ENTER_CD}:${row.SEQ}`, newId);
      const userId = idMap.require('user', `${row.ENTER_CD}:${row.SABUN}`);

      // Oracle DATE columns arrive as JS Date objects via oracledb
      const attendDate = row.ATTEND_DATE instanceof Date
        ? row.ATTEND_DATE.toISOString()
        : String(row.ATTEND_DATE);

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO attendance (id, user_id, attend_date, attend_type, in_time, out_time, reason, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
           ON CONFLICT (user_id, attend_date, attend_type) DO UPDATE
             SET in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, updated_at = NOW()`,
          [
            newId, userId, attendDate, row.ATTEND_TYPE_CD,
            row.IN_TIME ?? null, row.OUT_TIME ?? null, row.REASON ?? null,
            row.CHK_DATE ?? new Date(),
          ],
        );
      }
    }
  }
  console.log(`  attendance: ${rows.length} processed`);
}

async function migrateOutManage(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyOutManage>(
    `SELECT ENTER_CD, SABUN, OUT_TYPE_CD, APPLY_START_DT, APPLY_END_DT, REASON, STATUS_CD, CHK_ID, CHK_DATE
     FROM TMAN_OUTMANAGE ${whereClause} ORDER BY ENTER_CD, SABUN`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} out_manage rows`);

  for (const row of rows) {
    const newId = randomUUID();
    const userId = idMap.require('user', `${row.ENTER_CD}:${row.SABUN}`);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO out_manage (id, user_id, out_type, apply_start_dt, apply_end_dt, reason, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
         ON CONFLICT (user_id, apply_start_dt, out_type) DO UPDATE
           SET status = EXCLUDED.status, updated_at = NOW()`,
        [
          newId, userId, row.OUT_TYPE_CD, row.APPLY_START_DT, row.APPLY_END_DT,
          row.REASON ?? null, row.STATUS_CD, row.CHK_DATE ?? new Date(),
        ],
      );
    }
  }
  console.log(`  out_manage: ${rows.length} processed`);
}

async function migrateOutManageTime(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyOutManageTime>(
    `SELECT ENTER_CD, SABUN, CHKDATE, START_TIME, END_TIME, OUT_TYPE_CD, CHK_ID, CHK_DATE
     FROM TMAN_OUTMANAGE_TIME ${whereClause} ORDER BY ENTER_CD, SABUN, CHKDATE`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} out_manage_detail rows`);

  for (const row of rows) {
    const newId = randomUUID();
    const userId = idMap.require('user', `${row.ENTER_CD}:${row.SABUN}`);

    // chkdate → updated_at (per design spec mapping)
    const updatedAt = row.CHKDATE instanceof Date ? row.CHKDATE : new Date(row.CHKDATE);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO out_manage_detail (id, user_id, chk_date, start_time, end_time, out_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
         ON CONFLICT (user_id, chk_date, out_type) DO UPDATE
           SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, updated_at = NOW()`,
        [newId, userId, updatedAt, row.START_TIME, row.END_TIME, row.OUT_TYPE_CD, updatedAt],
      );
    }
  }
  console.log(`  out_manage_detail: ${rows.length} processed`);
}
