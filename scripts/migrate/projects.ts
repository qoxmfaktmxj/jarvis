// scripts/migrate/projects.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyProject, LegacyTask, LegacyInquiry, LegacyStaff } from './types';

const BATCH_SIZE = 100;

export async function migrateProjects(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  await migrateProjectRecords(oracle, pg, idMap, opts);
  await migrateProjectTasks(oracle, pg, idMap, opts);
  await migrateProjectInquiries(oracle, pg, idMap, opts);
  await migrateProjectStaff(oracle, pg, idMap, opts);
}

async function migrateProjectRecords(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyProject>(
    `SELECT ENTER_CD, PROJECT_ID, PROJECT_NM, PROJECT_DESC, STATUS_CD, START_DT, END_DT, COMPANY_CD, CHK_ID, CHK_DATE
     FROM TDEV_PROJECT ${whereClause} ORDER BY ENTER_CD, PROJECT_ID`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} project rows`);

  for (const row of rows) {
    const newId = randomUUID();
    idMap.set('project', `${row.ENTER_CD}:${row.PROJECT_ID}`, newId);
    const workspaceId = idMap.require('workspace', row.ENTER_CD);
    const updatedById = row.CHK_ID
      ? (idMap.get('user', `${row.ENTER_CD}:${row.CHK_ID}`) ?? null)
      : null;
    const companyId = row.COMPANY_CD
      ? (idMap.get('company', `${row.ENTER_CD}:${row.COMPANY_CD}:DEV`) ?? null)
      : null;

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO project (id, workspace_id, name, description, status, start_date, end_date, company_id, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
         ON CONFLICT (workspace_id, id) DO UPDATE
           SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW()`,
        [
          newId, workspaceId, row.PROJECT_NM, row.PROJECT_DESC ?? null,
          row.STATUS_CD, row.START_DT, row.END_DT ?? null,
          companyId, updatedById, row.CHK_DATE ?? new Date(),
        ],
      );
    }
  }
  console.log(`  project: ${idMap.count('project')} processed`);
}

async function migrateProjectTasks(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyTask>(
    `SELECT ENTER_CD, REQUEST_COMPANY_CD, REQUEST_YM, REQUEST_SEQ, PROJECT_ID,
            TITLE, CONTENT, STATUS_CD, PRIORITY_CD, SABUN, DUE_DATE, CHK_ID, CHK_DATE
     FROM TDEV_MANAGE ${whereClause} ORDER BY ENTER_CD, REQUEST_YM, REQUEST_SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} task rows`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const newId = randomUUID();
      const projectId = idMap.require('project', `${row.ENTER_CD}:${row.PROJECT_ID}`);
      const assigneeId = idMap.get('user', `${row.ENTER_CD}:${row.SABUN}`) ?? null;
      const companyId = idMap.get('company', `${row.ENTER_CD}:${row.REQUEST_COMPANY_CD}:DEV`) ?? null;

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO project_task (id, project_id, request_company_id, request_ym, request_seq,
            title, content, status, priority, assignee_id, due_date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
           ON CONFLICT (project_id, request_ym, request_seq) DO UPDATE
             SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = NOW()`,
          [
            newId, projectId, companyId, row.REQUEST_YM, row.REQUEST_SEQ,
            row.TITLE, row.CONTENT ?? null, row.STATUS_CD, row.PRIORITY_CD,
            assigneeId, row.DUE_DATE ?? null, row.CHK_DATE ?? new Date(),
          ],
        );
      }
    }
  }
  console.log(`  project_task: ${rows.length} processed`);
}

async function migrateProjectInquiries(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyInquiry>(
    `SELECT ENTER_CD, IN_SEQ, PROJECT_ID, TITLE, CONTENT, STATUS_CD, SABUN, CHK_ID, CHK_DATE
     FROM TDEV_INQUIRY ${whereClause} ORDER BY ENTER_CD, IN_SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];

  for (const row of rows) {
    const newId = randomUUID();
    idMap.set('inquiry', `${row.ENTER_CD}:${row.IN_SEQ}`, newId);
    const projectId = idMap.require('project', `${row.ENTER_CD}:${row.PROJECT_ID}`);
    const authorId = idMap.get('user', `${row.ENTER_CD}:${row.SABUN}`) ?? null;

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO project_inquiry (id, project_id, title, content, status, author_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
         ON CONFLICT (id) DO NOTHING`,
        [newId, projectId, row.TITLE, row.CONTENT ?? null, row.STATUS_CD, authorId, row.CHK_DATE ?? new Date()],
      );
    }
  }
  console.log(`  project_inquiry: ${rows.length} processed`);
}

async function migrateProjectStaff(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyStaff>(
    `SELECT ENTER_CD, NO, PROJECT_ID, SABUN, ROLE_CD, CHK_ID, CHK_DATE
     FROM TDEV_STAFF ${whereClause} ORDER BY ENTER_CD, PROJECT_ID, NO`,
    bindParams,
  );
  const rows = result.rows ?? [];

  for (const row of rows) {
    const projectId = idMap.require('project', `${row.ENTER_CD}:${row.PROJECT_ID}`);
    const userId = idMap.require('user', `${row.ENTER_CD}:${row.SABUN}`);

    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO project_staff (project_id, user_id, role_code, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (project_id, user_id) DO UPDATE SET role_code = EXCLUDED.role_code`,
        [projectId, userId, row.ROLE_CD],
      );
    }
  }
  console.log(`  project_staff: ${rows.length} processed`);
}
