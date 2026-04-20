// scripts/migrate/validators.ts
import type { Pool } from 'pg';
import type { IdMap } from './id-map';

export interface ValidationResult {
  passed: string[];
  warnings: string[];
}

export async function validateMigration(
  pgPool: Pool,
  idMap: IdMap,
): Promise<ValidationResult> {
  const passed: string[] = [];
  const warnings: string[] = [];

  // ── Row count checks ────────────────────────────────────────────────────────
  const tables = [
    'workspace', 'organization', '"user"', 'role', 'user_role',
    'menu_item', 'code_group', 'code_item',
    'company', 'project', 'project_task', 'project_inquiry', 'project_staff',
    'system', 'system_access',
    'knowledge_page', 'knowledge_page_version',
    'audit_log',
  ];

  for (const table of tables) {
    const res = await pgPool.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
    const cnt = Number(res.rows[0].cnt);
    const expected = idMap.count(table.replace(/"/g, ''));
    if (expected > 0 && cnt < expected) {
      warnings.push(`${table}: pg has ${cnt} rows but idMap tracked ${expected} (${expected - cnt} missing)`);
    } else {
      passed.push(`${table}: ${cnt} rows`);
    }
  }

  // ── FK integrity checks ──────────────────────────────────────────────────────
  const orphanTasks = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM project_task
     WHERE project_id NOT IN (SELECT id FROM project)`,
  );
  if (Number(orphanTasks.rows[0].cnt) > 0) {
    warnings.push(`${orphanTasks.rows[0].cnt} orphaned project_task rows (missing parent project)`);
  } else {
    passed.push('project_task FK: all project references resolve');
  }

  const orphanStaff = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM project_staff
     WHERE user_id NOT IN (SELECT id FROM "user")`,
  );
  if (Number(orphanStaff.rows[0].cnt) > 0) {
    warnings.push(`${orphanStaff.rows[0].cnt} orphaned project_staff rows (missing user)`);
  } else {
    passed.push('project_staff FK: all user references resolve');
  }

  // ── SECURITY: No plain-text credentials in system_access ────────────────────
  // Any non-null, non-empty value that does not start with vault:// is a violation.
  const plainUsernames = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM system_access
     WHERE username_ref IS NOT NULL
       AND username_ref != ''
       AND username_ref NOT LIKE 'vault://%'`,
  );
  if (Number(plainUsernames.rows[0].cnt) > 0) {
    throw new Error(
      `SECURITY VIOLATION: ${plainUsernames.rows[0].cnt} system_access rows have ` +
      `plain-text username_ref values (not vault:// URIs). ` +
      `Migration must be rolled back and fixed before proceeding.`,
    );
  }
  passed.push('system_access.username_ref: all values are vault:// URIs or null');

  const plainConnections = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM system_access
     WHERE connection_string_ref IS NOT NULL
       AND connection_string_ref != ''
       AND connection_string_ref NOT LIKE 'vault://%'`,
  );
  if (Number(plainConnections.rows[0].cnt) > 0) {
    throw new Error(
      `SECURITY VIOLATION: ${plainConnections.rows[0].cnt} system_access rows have ` +
      `plain-text connection_string_ref values. Migration must be rolled back.`,
    );
  }
  passed.push('system_access.connection_string_ref: all values are vault:// URIs or null');

  // ── Knowledge pages without content warning ──────────────────────────────────
  const emptyPages = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM knowledge_page_version WHERE content IS NULL OR content = ''`,
  );
  if (Number(emptyPages.rows[0].cnt) > 0) {
    warnings.push(`${emptyPages.rows[0].cnt} knowledge_page_version rows have empty content`);
  }

  return { passed, warnings };
}
