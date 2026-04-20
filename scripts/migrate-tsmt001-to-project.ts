#!/usr/bin/env tsx
/**
 * scripts/migrate-tsmt001-to-project.ts
 *
 * Migrates TSMT001 records (data/infra/records.jsonl, 392 rows) into:
 *   - company  (upsert by code)
 *   - project  (upsert by (workspaceId, companyId))
 *   - project_access  (extra rows per company/env beyond the primary)
 *
 * Run (dry-run safe — DO NOT execute against live DB without confirmation):
 *   WORKSPACE_ID=<uuid> pnpm tsx scripts/migrate-tsmt001-to-project.ts
 *
 * If WORKSPACE_ID is omitted, the first workspace in DB is used.
 *
 * NOTE: DB imports are kept inside main() so vitest can import and test
 * the pure-function exports without a live database connection.
 */
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TsmtRecord = {
  row_number?: number | null;
  source_line?: number | null;
  enter_cd: string | null;
  company_cd: string | null;
  env_type: string | null;
  connect_cd: string | null;
  vpn_file_seq: string | null;
  domain_addr: string | null;
  login_info: string | null;
  svn_addr: string | null;
  db_connect_info: string | null;
  db_user_info: string | null;
  src_info: string | null;
  class_info: string | null;
  memo: string | null;
};

// ---------------------------------------------------------------------------
// Pure helper exports (tested by vitest)
// ---------------------------------------------------------------------------

/**
 * Groups records by company_cd → env_type.
 * Skips records with null company_cd or null env_type.
 */
export function groupRecordsByCompanyAndEnv(
  recs: TsmtRecord[],
): Record<string, Record<string, TsmtRecord[]>> {
  const out: Record<string, Record<string, TsmtRecord[]>> = {};
  for (const r of recs) {
    if (!r.company_cd || !r.env_type) continue;
    out[r.company_cd] ??= {};
    out[r.company_cd][r.env_type] ??= [];
    out[r.company_cd][r.env_type].push(r);
  }
  return out;
}

/** Count non-null, non-empty fields in a record (used to pick the "fullest" row). */
function countPopulated(r: TsmtRecord): number {
  return Object.values(r).filter(v => v != null && String(v).length > 0).length;
}

/** Return the record with the most populated fields from the array. */
function pickPrimary(rs: TsmtRecord[]): TsmtRecord {
  return [...rs].sort((a, b) => countPopulated(b) - countPopulated(a))[0]!;
}

/**
 * Parse "username / password" (slash-separated) from a login_info string.
 * Falls back to (login_info, null) if no slash is found.
 */
function splitLogin(s: string | null): { user: string | null; pass: string | null } {
  if (!s) return { user: null, pass: null };
  const m = s.match(/^([^/\s]+)\s*\/\s*(.+)$/);
  if (m) return { user: m[1]!.trim(), pass: m[2]!.trim() };
  return { user: s.trim(), pass: null };
}

/**
 * Map a set of rows (all from the same env_type) to a flat project column object.
 * The "fullest" row is chosen as primary. Env prefix is prod_ or dev_.
 */
export function mapPrimaryRowToProject(rs: TsmtRecord[]): Record<string, string | null> {
  const r = pickPrimary(rs);
  const env = r.env_type === '운영' ? 'prod' : 'dev';

  const memoLines = [
    r.memo,
    r.login_info ? `로그인: ${r.login_info}` : null,
    r.db_user_info ? `DB계정: ${r.db_user_info}` : null,
  ].filter(Boolean);

  return {
    envKey: env,
    [`${env}_domain_url`]: r.domain_addr,
    [`${env}_connect_type`]: r.connect_cd,
    [`${env}_repository_url`]: r.svn_addr,
    [`${env}_db_dsn`]: r.db_connect_info,
    [`${env}_src_path`]: r.src_info,
    [`${env}_class_path`]: r.class_info,
    [`${env}_memo`]: memoLines.length > 0 ? memoLines.join('\n---\n') : null,
  };
}

/**
 * Map a single "extra" TSMT row to a project_access insert shape.
 */
export function mapExtraRowToAccess(
  r: TsmtRecord,
  envType: 'prod' | 'dev',
): {
  envType: 'prod' | 'dev';
  accessType: string;
  label: string;
  host: string | null;
  port: number | null;
  usernameRef: string | null;
  passwordRef: string | null;
  connectionStringRef: string | null;
  vpnFileRef: string | null;
  notes: string | null;
  requiredRole: 'DEVELOPER';
  sortOrder: number;
} {
  const { user, pass } = splitLogin(r.login_info);
  const accessType = r.db_connect_info ? 'db' : r.vpn_file_seq ? 'vpn' : 'web';

  const labelRaw = r.memo?.split('\n')[0]?.slice(0, 100);
  const label = labelRaw ?? `${accessType} access`;

  const notesLines = [r.src_info, r.class_info, r.memo].filter(Boolean);

  return {
    envType,
    accessType,
    label,
    host: null,
    port: null,
    usernameRef: user,
    passwordRef: pass,
    connectionStringRef: r.db_connect_info,
    vpnFileRef: r.vpn_file_seq,
    notes: notesLines.length > 0 ? notesLines.join('\n---\n') : null,
    requiredRole: 'DEVELOPER' as const,
    sortOrder: 0,
  };
}

// ---------------------------------------------------------------------------
// Main (DB writes — only runs when executed directly)
// ---------------------------------------------------------------------------

async function main() {
  // DB imports are lazy so pure-function exports can be tested without a DB.
  await import('dotenv/config');
  const { db } = await import('@jarvis/db/client');
  const { company, project, projectAccess, workspace } = await import('@jarvis/db/schema');
  const { and, eq } = await import('drizzle-orm');

  const WS = process.env.WORKSPACE_ID;
  let workspaceId = WS;

  if (!workspaceId) {
    const [ws] = await db.select().from(workspace).limit(1);
    if (!ws) throw new Error('no workspace found; set WORKSPACE_ID env var');
    workspaceId = ws.id;
  }

  const recordsPath = path.resolve(process.cwd(), 'data/infra/records.jsonl');
  const lines = fs.readFileSync(recordsPath, 'utf-8').split('\n').filter(Boolean);
  const records: TsmtRecord[] = lines.map(l => JSON.parse(l));
  const grouped = groupRecordsByCompanyAndEnv(records);

  const report = { companies: 0, projects: 0, access: 0, skipped: 0 };

  for (const [companyCd, byEnv] of Object.entries(grouped)) {
    // Upsert company
    let [co] = await db
      .select()
      .from(company)
      .where(and(eq(company.workspaceId, workspaceId), eq(company.code, companyCd)))
      .limit(1);

    if (!co) {
      const inserted = await db
        .insert(company)
        .values({ workspaceId, code: companyCd, name: companyCd })
        .returning();
      co = inserted[0];
      report.companies++;
    }

    if (!co) {
      console.warn(`[warn] Failed to upsert company ${companyCd} — skipping`);
      report.skipped++;
      continue;
    }

    // Build flat project columns from prod + dev primaries
    const prodPrimary = byEnv['운영'] ? mapPrimaryRowToProject(byEnv['운영']) : {};
    const devPrimary = byEnv['개발'] ? mapPrimaryRowToProject(byEnv['개발']) : {};

    const { envKey: _pk, ...prodCols } = prodPrimary as Record<string, string | null>;
    const { envKey: _dk, ...devCols } = devPrimary as Record<string, string | null>;

    // Map snake_case plan keys to camelCase Drizzle column names
    function toCamel(obj: Record<string, string | null>) {
      const result: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(obj)) {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        result[camel] = v;
      }
      return result;
    }

    const projectValues = {
      workspaceId,
      companyId: co.id,
      name: `${companyCd} HR System`,
      description: null as string | null,
      ...toCamel(prodCols),
      ...toCamel(devCols),
    };

    // Upsert on (workspaceId, companyId) unique constraint
    const projInserted = await db
      .insert(project)
      .values(projectValues)
      .onConflictDoUpdate({
        target: [project.workspaceId, project.companyId],
        set: projectValues,
      })
      .returning();

    const proj = projInserted[0];
    report.projects++;

    if (!proj) continue;

    // Insert extra (non-primary) rows as project_access entries
    for (const env of ['운영', '개발'] as const) {
      const envType = env === '운영' ? 'prod' : 'dev';
      const rows = byEnv[env] ?? [];
      if (rows.length <= 1) continue;

      const primary = pickPrimary(rows);
      const extras = rows.filter(r => r !== primary);

      for (const r of extras) {
        await db.insert(projectAccess).values({
          workspaceId,
          projectId: proj.id,
          ...mapExtraRowToAccess(r, envType),
        });
        report.access++;
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
