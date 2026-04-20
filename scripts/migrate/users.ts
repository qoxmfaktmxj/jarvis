// scripts/migrate/users.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyUser } from './types';

const BATCH_SIZE = 100;

// Map legacy ROLE_CD values to Jarvis role codes.
// Adjust keys to match actual values in TSYS305_NEW.ROLE_CD.
const ROLE_CD_MAP: Record<string, string> = {
  ADMIN: 'ADMIN',
  MGR: 'MANAGER',
  MANAGER: 'MANAGER',
  DEV: 'DEVELOPER',
  DEVELOPER: 'DEVELOPER',
  HR: 'HR',
  VIEWER: 'VIEWER',
};

export async function migrateUsers(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyUser>(
    `SELECT ENTER_CD, SABUN, USER_NM, EMAIL, ORG_CD, ORG_NM, ROLE_CD, USE_YN, CHK_ID, CHK_DATE
     FROM TSYS305_NEW ${whereClause} ORDER BY ENTER_CD, SABUN`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} user rows`);

  // Pre-fetch role UUIDs once
  const roleRows = await pg.query<{ id: string; code: string }>(
    `SELECT id, code FROM role`,
  );
  const roleLookup = new Map<string, string>(
    roleRows.rows.map((r: { id: string; code: string }) => [r.code, r.id]),
  );

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const newUserId = randomUUID();
      idMap.set('user', `${row.ENTER_CD}:${row.SABUN}`, newUserId);

      const workspaceId = idMap.require('workspace', row.ENTER_CD);
      const orgKey = `${row.ENTER_CD}:${row.ORG_CD}`;
      const orgId = idMap.get('org', orgKey) ?? null;
      const status = row.USE_YN === 'Y' ? 'active' : 'inactive';

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO "user" (id, workspace_id, employee_id, name, email, org_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (workspace_id, employee_id) DO UPDATE
             SET name = EXCLUDED.name,
                 email = EXCLUDED.email,
                 org_id = EXCLUDED.org_id,
                 status = EXCLUDED.status,
                 updated_at = NOW()`,
          [newUserId, workspaceId, row.SABUN, row.USER_NM, row.EMAIL ?? null, orgId, status],
        );

        // user_role mapping
        const roleCode = ROLE_CD_MAP[row.ROLE_CD?.toUpperCase()] ?? 'VIEWER';
        const roleId = roleLookup.get(roleCode);
        if (roleId) {
          await pg.query(
            `INSERT INTO user_role (user_id, role_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [newUserId, roleId],
          );
        }
        inserted++;
      } else {
        console.log(`  [dry-run] user: ${row.ENTER_CD}/${row.SABUN} "${row.USER_NM}" → ${newUserId}`);
      }
    }
  }
  console.log(`  users: ${opts.isDryRun ? rows.length : inserted} processed`);
}
