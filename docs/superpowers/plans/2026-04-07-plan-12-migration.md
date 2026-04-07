# Jarvis Plan 12: Data Migration (Oracle → PostgreSQL)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all legacy Oracle SSMS data to Jarvis PostgreSQL. Idempotent, ordered, with dry-run mode. Credentials in TMAN_INFRA_MANAGE converted to secret_ref URIs — never stored in plain text.

**Architecture:** Migration script runs in order (workspace → user → project → system). Each module: query Oracle → transform → bulk insert PostgreSQL. ID mapping registry tracks legacy ID → new UUID. After each table: validate row count. Credentials extracted to SOPS-encrypted `credentials.enc.json`.

**Tech Stack:** Node.js 22, oracledb, pg, Drizzle ORM (validation only), tsx (TypeScript runner), SOPS

**Prerequisites:** Plan 01 Foundation complete. Oracle 11g XE accessible. PostgreSQL running with schema migrated. `.env` with `ORACLE_*` and `DATABASE_URL`.

---

## File Map

```
scripts/
├── migrate-legacy.ts                             CREATE (main orchestrator)
├── migrate/
│   ├── workspace-org.ts                          CREATE
│   ├── users.ts                                  CREATE
│   ├── menu-codes.ts                             CREATE
│   ├── companies.ts                              CREATE
│   ├── projects.ts                               CREATE
│   ├── attendance.ts                             CREATE
│   ├── systems.ts                                CREATE (credential → secret_ref conversion)
│   ├── knowledge.ts                              CREATE
│   ├── files.ts                                  CREATE (Oracle BLOB/path → MinIO)
│   └── audit-logs.ts                             CREATE
├── migrate/types.ts                              CREATE (LegacyRow types)
├── migrate/id-map.ts                             CREATE (ID mapping registry)
└── migrate/validators.ts                         CREATE
```

---

## Tasks

### Task 1: Migration types + ID map registry

- [ ] Create `scripts/migrate/types.ts` with TypeScript interfaces for all legacy Oracle row types
- [ ] Create `scripts/migrate/id-map.ts` with the `IdMap` class
- [ ] Write Vitest tests for `IdMap`: set + get + require (throws on missing key)

#### `scripts/migrate/types.ts`

```typescript
// scripts/migrate/types.ts
// TypeScript interfaces matching Oracle column names (uppercase, as returned by oracledb)

export interface LegacyWorkspace {
  ENTER_CD: string;
}

export interface LegacyOrg {
  ENTER_CD: string;
  ORG_CD: string;
  ORG_NM: string;
}

export interface LegacyUser {
  ENTER_CD: string;
  SABUN: string;
  USER_NM: string;
  EMAIL: string;
  ORG_CD: string;
  ORG_NM: string;
  ROLE_CD: string;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyMenu {
  ENTER_CD: string;
  MENU_ID: string;
  MENU_NM: string;
  PARENT_MENU_ID: string | null;
  MENU_URL: string;
  MENU_ORDER: number;
  USE_YN: string;
  ICON: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCodeGroup {
  ENTER_CD: string;
  GRCODE_CD: string;
  GRCODE_NM: string;
  USE_YN: string;
  SORT_ORDER: number;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCodeItem {
  ENTER_CD: string;
  GRCODE_CD: string;
  CODE: string;
  CODE_NM: string;
  USE_YN: string;
  SORT_ORDER: number;
  ETC1: string | null;
  ETC2: string | null;
  ETC3: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyFile {
  ENTER_CD: string;
  FILE_SEQ: number;
  FILE_NM: string;
  FILE_PATH: string;
  FILE_SIZE: number;
  FILE_EXT: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCompany {
  ENTER_CD: string;
  COMPANY_CD: string;
  OBJECT_DIV: string;
  COMPANY_NM: string;
  CEO_NM: string | null;
  BIZ_NO: string | null;
  ADDR: string | null;
  TEL: string | null;
  FAX: string | null;
  EMAIL: string | null;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyProject {
  ENTER_CD: string;
  PROJECT_ID: number;
  PROJECT_NM: string;
  PROJECT_DESC: string | null;
  STATUS_CD: string;
  START_DT: Date;
  END_DT: Date | null;
  COMPANY_CD: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyTask {
  ENTER_CD: string;
  REQUEST_COMPANY_CD: string;
  REQUEST_YM: string;
  REQUEST_SEQ: number;
  PROJECT_ID: number;
  TITLE: string;
  CONTENT: string | null;
  STATUS_CD: string;
  PRIORITY_CD: string;
  SABUN: string;
  DUE_DATE: Date | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInquiry {
  ENTER_CD: string;
  IN_SEQ: number;
  PROJECT_ID: number;
  TITLE: string;
  CONTENT: string | null;
  STATUS_CD: string;
  SABUN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyStaff {
  ENTER_CD: string;
  NO: number;
  PROJECT_ID: number;
  SABUN: string;
  ROLE_CD: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyAttendance {
  ENTER_CD: string;
  SEQ: number;
  SABUN: string;
  ATTEND_DATE: Date;
  ATTEND_TYPE_CD: string;
  IN_TIME: string | null;
  OUT_TIME: string | null;
  REASON: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyOutManage {
  ENTER_CD: string;
  SABUN: string;
  OUT_TYPE_CD: string;
  APPLY_START_DT: Date;
  APPLY_END_DT: Date;
  REASON: string | null;
  STATUS_CD: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyOutManageTime {
  ENTER_CD: string;
  SABUN: string;
  CHKDATE: Date;
  START_TIME: string;
  END_TIME: string;
  OUT_TYPE_CD: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInfraManage {
  ENTER_CD: string;
  SEQ: number;
  SYS_NM: string;
  TASK_GUBUN_CD: string;   // → system.category
  DEV_GB_CD: string;       // → system.environment
  LOGIN_INFO: string | null;        // CRITICAL: plain-text credential → secret_ref
  DB_CONNECT_INFO: string | null;   // CRITICAL: plain-text credential → secret_ref
  DB_USER_INFO: string | null;      // CRITICAL: plain-text credential → secret_ref
  VPN_FILE_SEQ: number | null;      // → secret_ref after file migration
  MEMO: string | null;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInfraPage {
  ENTER_CD: string;
  SEQ: number;
  MANAGE_SEQ: number;   // FK → LegacyInfraManage.SEQ
  PAGE_CONTENT: string | null;
  CHK_DATE: Date;
  CHK_ID: string;
}

export interface LegacyAuditLog {
  LOG_ID: number;
  ENTER_CD: string;
  SABUN: string | null;
  LOG_DATE: Date;
  ACTION_CD: string;
  TARGET_TABLE: string | null;
  TARGET_ID: string | null;
  IP_ADDR: string | null;
  DETAIL: string | null;
}
```

#### `scripts/migrate/id-map.ts`

```typescript
// scripts/migrate/id-map.ts
// In-memory registry mapping legacy Oracle IDs → new PostgreSQL UUIDs.
// Keys use the pattern: "tableName:legacyId" for unambiguous lookups.

export class IdMap {
  private maps: Map<string, Map<string, string>> = new Map();

  set(table: string, legacyId: string, newId: string): void {
    if (!this.maps.has(table)) {
      this.maps.set(table, new Map());
    }
    this.maps.get(table)!.set(legacyId, newId);
  }

  get(table: string, legacyId: string): string | undefined {
    return this.maps.get(table)?.get(legacyId);
  }

  /** Throws if the mapping does not exist. Use when FK must resolve. */
  require(table: string, legacyId: string): string {
    const id = this.get(table, legacyId);
    if (!id) {
      throw new Error(
        `IdMap: no mapping for table="${table}" legacyId="${legacyId}". ` +
        `Ensure the parent table was migrated before this one.`
      );
    }
    return id;
  }

  /** Number of entries registered for a table. */
  count(table: string): number {
    return this.maps.get(table)?.size ?? 0;
  }

  /** All registered tables. */
  tables(): string[] {
    return Array.from(this.maps.keys());
  }
}
```

#### `scripts/migrate/__tests__/id-map.test.ts`

```typescript
// scripts/migrate/__tests__/id-map.test.ts
import { describe, it, expect } from 'vitest';
import { IdMap } from '../id-map';

describe('IdMap', () => {
  it('sets and gets a mapping', () => {
    const map = new IdMap();
    map.set('user', 'EMP001', 'uuid-1');
    expect(map.get('user', 'EMP001')).toBe('uuid-1');
  });

  it('returns undefined for unknown key', () => {
    const map = new IdMap();
    expect(map.get('user', 'MISSING')).toBeUndefined();
  });

  it('returns undefined for unknown table', () => {
    const map = new IdMap();
    expect(map.get('unknown_table', 'EMP001')).toBeUndefined();
  });

  it('require returns value when mapping exists', () => {
    const map = new IdMap();
    map.set('project', '42', 'uuid-proj-1');
    expect(map.require('project', '42')).toBe('uuid-proj-1');
  });

  it('require throws when mapping is missing', () => {
    const map = new IdMap();
    expect(() => map.require('project', '999')).toThrow(
      /no mapping for table="project" legacyId="999"/
    );
  });

  it('count returns correct size per table', () => {
    const map = new IdMap();
    map.set('user', 'A', '1');
    map.set('user', 'B', '2');
    map.set('project', 'X', '3');
    expect(map.count('user')).toBe(2);
    expect(map.count('project')).toBe(1);
    expect(map.count('absent')).toBe(0);
  });

  it('overwrites existing mapping on duplicate set', () => {
    const map = new IdMap();
    map.set('user', 'A', 'uuid-old');
    map.set('user', 'A', 'uuid-new');
    expect(map.get('user', 'A')).toBe('uuid-new');
  });
});
```

---

### Task 2: Migration orchestrator

- [ ] Create `scripts/migrate-legacy.ts` as the main entry point
- [ ] Wire all module imports, connection setup, migration order, and final validation
- [ ] Support `--dry-run` and `--enter-cd=<code>` CLI flags

#### `scripts/migrate-legacy.ts`

```typescript
// scripts/migrate-legacy.ts
// Main Oracle → PostgreSQL migration orchestrator.
// Usage:
//   tsx scripts/migrate-legacy.ts                       # migrate all workspaces
//   tsx scripts/migrate-legacy.ts --enter-cd=ACME       # single workspace
//   tsx scripts/migrate-legacy.ts --dry-run             # preview without writing

import 'dotenv/config';
import oracledb from 'oracledb';
import { Pool } from 'pg';
import { IdMap } from './migrate/id-map';
import { migrateWorkspaceOrg } from './migrate/workspace-org';
import { migrateUsers } from './migrate/users';
import { migrateMenuCodes } from './migrate/menu-codes';
import { migrateCompanies } from './migrate/companies';
import { migrateProjects } from './migrate/projects';
import { migrateAttendance } from './migrate/attendance';
import { migrateSystems } from './migrate/systems';
import { migrateKnowledge } from './migrate/knowledge';
import { migrateAuditLogs } from './migrate/audit-logs';
import { validateMigration } from './migrate/validators';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

export interface MigrationOptions {
  isDryRun: boolean;
  enterCd?: string;
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const enterCdArg = process.argv.find((a) => a.startsWith('--enter-cd='));
  const enterCd = enterCdArg?.split('=')[1];

  const opts: MigrationOptions = { isDryRun, enterCd };

  console.log('='.repeat(60));
  console.log('Jarvis Data Migration: Oracle → PostgreSQL');
  console.log(`  dry-run : ${isDryRun}`);
  console.log(`  enter-cd: ${enterCd ?? '(all)'}`);
  console.log('='.repeat(60));

  if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECTION_STRING) {
    throw new Error('Missing ORACLE_USER / ORACLE_PASSWORD / ORACLE_CONNECTION_STRING in environment');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in environment');
  }

  const oracle = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECTION_STRING, // e.g. localhost:1521/xe
  });

  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const idMap = new IdMap();

  try {
    // Migration order: dependencies first
    console.log('\n[1/9] workspace + org');
    await migrateWorkspaceOrg(oracle, pgPool, idMap, opts);

    console.log('\n[2/9] users');
    await migrateUsers(oracle, pgPool, idMap, opts);

    console.log('\n[3/9] menu items + code groups/items');
    await migrateMenuCodes(oracle, pgPool, idMap, opts);

    console.log('\n[4/9] companies');
    await migrateCompanies(oracle, pgPool, idMap, opts);

    console.log('\n[5/9] projects, tasks, inquiries, staff');
    await migrateProjects(oracle, pgPool, idMap, opts);

    console.log('\n[6/9] attendance');
    await migrateAttendance(oracle, pgPool, idMap, opts);

    console.log('\n[7/9] systems (credential → secret_ref)');
    await migrateSystems(oracle, pgPool, idMap, opts);

    console.log('\n[8/9] knowledge pages');
    await migrateKnowledge(oracle, pgPool, idMap, opts);

    console.log('\n[9/9] audit logs');
    await migrateAuditLogs(oracle, pgPool, idMap, opts);

    console.log('\n[validate] running post-migration validation...');
    const result = await validateMigration(pgPool, idMap);

    console.log('\n--- Validation Results ---');
    result.passed.forEach((msg) => console.log(`  PASS: ${msg}`));
    result.warnings.forEach((msg) => console.warn(`  WARN: ${msg}`));
    console.log('\nMigration complete.');
  } finally {
    await oracle.close();
    await pgPool.end();
  }
}

main().catch((err) => {
  console.error('MIGRATION FAILED:', err);
  process.exit(1);
});
```

---

### Task 3: Workspace + Org + User migration

- [ ] Create `scripts/migrate/workspace-org.ts`
- [ ] Create `scripts/migrate/users.ts`
- [ ] Batch inserts at 100 rows, use `ON CONFLICT DO NOTHING`

#### `scripts/migrate/workspace-org.ts`

```typescript
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
```

#### `scripts/migrate/users.ts`

```typescript
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
    roleRows.rows.map((r) => [r.code, r.id]),
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
      const isActive = row.USE_YN === 'Y';

      if (!opts.isDryRun) {
        await pg.query(
          `INSERT INTO "user" (id, workspace_id, employee_id, name, email, org_id, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (workspace_id, employee_id) DO UPDATE
             SET name = EXCLUDED.name,
                 email = EXCLUDED.email,
                 org_id = EXCLUDED.org_id,
                 is_active = EXCLUDED.is_active,
                 updated_at = NOW()`,
          [newUserId, workspaceId, row.SABUN, row.USER_NM, row.EMAIL ?? null, orgId, isActive],
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
```

---

### Task 4: Menu + Code migration

- [ ] Create `scripts/migrate/menu-codes.ts`
- [ ] Handle recursive menu hierarchy (parentMenuId 0/null → root)
- [ ] Batch-insert code groups and code items from TSYS005_NEW

#### `scripts/migrate/menu-codes.ts`

```typescript
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
```

---

### Task 5: Company + Project + Staff + Inquiry migration

- [ ] Create `scripts/migrate/companies.ts`
- [ ] Create `scripts/migrate/projects.ts` covering TDEV_PROJECT, TDEV_MANAGE, TDEV_INQUIRY, TDEV_STAFF

#### `scripts/migrate/companies.ts`

```typescript
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
```

#### `scripts/migrate/projects.ts`

```typescript
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
```

---

### Task 6: Attendance migration

- [ ] Create `scripts/migrate/attendance.ts`
- [ ] Handle TMAN_ATTENDANCE, TMAN_OUTMANAGE, TMAN_OUTMANAGE_TIME
- [ ] Convert Oracle DATE → ISO timestamptz correctly

#### `scripts/migrate/attendance.ts`

```typescript
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
```

---

### Task 7: Systems migration (CRITICAL — credential conversion)

- [ ] Create `scripts/migrate/systems.ts` with explicit credential → secret_ref conversion
- [ ] Generate `credentials.enc.json` SOPS placeholder, NEVER write plain-text credentials to PostgreSQL
- [ ] Create `scripts/migrate/validators.ts` with security check for plain-text credentials

#### `scripts/migrate/systems.ts`

```typescript
// scripts/migrate/systems.ts
//
// SECURITY CRITICAL: TMAN_INFRA_MANAGE stores credentials in plain text.
// This module:
//   1. Reads credentials from Oracle (loginInfo, dbConnectInfo, dbUserInfo).
//   2. Generates a vault:// secret_ref URI for each non-empty credential.
//   3. Writes ONLY the secret_ref URI to PostgreSQL — never the raw value.
//   4. Accumulates { ref, value } pairs in credentialsRegistry.
//   5. At the end, writes credentialsRegistry to credentials.enc.json
//      (a SOPS-encrypted file — values are written ONLY there, not to the DB).
//
// After migration:
//   sops --encrypt --age <recipient> credentials.enc.json > credentials.enc.sops.json
//   shred -u credentials.enc.json   # delete the plaintext file

import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyInfraManage } from './types';

interface CredentialEntry {
  ref: string;           // vault:// URI stored in PostgreSQL
  field: string;         // loginInfo | dbConnectInfo | dbUserInfo
  systemId: string;      // new UUID of the system record
  legacySeq: number;     // TMAN_INFRA_MANAGE.SEQ for tracing
  value: string;         // PLAIN TEXT — only written to credentials.enc.json
}

const credentialsRegistry: CredentialEntry[] = [];

function buildSecretRef(systemId: string, fieldName: string): string {
  return `vault://jarvis/systems/${systemId}/${fieldName}`;
}

export async function migrateSystems(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  const result = await oracle.execute<LegacyInfraManage>(
    `SELECT ENTER_CD, SEQ, SYS_NM, TASK_GUBUN_CD, DEV_GB_CD,
            LOGIN_INFO, DB_CONNECT_INFO, DB_USER_INFO, VPN_FILE_SEQ, MEMO, USE_YN, CHK_ID, CHK_DATE
     FROM TMAN_INFRA_MANAGE ${whereClause} ORDER BY ENTER_CD, SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} TMAN_INFRA_MANAGE rows`);

  for (const row of rows) {
    const newSystemId = randomUUID();
    idMap.set('system', `${row.ENTER_CD}:${row.SEQ}`, newSystemId);
    const workspaceId = idMap.require('workspace', row.ENTER_CD);

    // ── Insert system record (no credentials here) ────────────────────────
    if (!opts.isDryRun) {
      await pg.query(
        `INSERT INTO system (id, workspace_id, name, category, environment, memo, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (workspace_id, id) DO UPDATE
           SET name = EXCLUDED.name, updated_at = NOW()`,
        [
          newSystemId, workspaceId, row.SYS_NM,
          row.TASK_GUBUN_CD,   // → system.category (per design spec)
          row.DEV_GB_CD,       // → system.environment
          row.MEMO ?? null,
          row.USE_YN === 'Y',
        ],
      );
    }

    // ── Credential → secret_ref conversion ────────────────────────────────
    // NEVER insert the raw value into any PostgreSQL column.
    // The raw value is collected into credentialsRegistry ONLY.

    let loginInfoRef: string | null = null;
    let dbConnectInfoRef: string | null = null;
    let dbUserInfoRef: string | null = null;
    let vpnFileRef: string | null = null;

    if (row.LOGIN_INFO) {
      loginInfoRef = buildSecretRef(newSystemId, 'loginInfo');
      credentialsRegistry.push({
        ref: loginInfoRef,
        field: 'loginInfo',
        systemId: newSystemId,
        legacySeq: row.SEQ,
        value: row.LOGIN_INFO,  // plain text stored ONLY in credentials.enc.json
      });
    }

    if (row.DB_CONNECT_INFO) {
      dbConnectInfoRef = buildSecretRef(newSystemId, 'dbConnectInfo');
      credentialsRegistry.push({
        ref: dbConnectInfoRef,
        field: 'dbConnectInfo',
        systemId: newSystemId,
        legacySeq: row.SEQ,
        value: row.DB_CONNECT_INFO,
      });
    }

    if (row.DB_USER_INFO) {
      dbUserInfoRef = buildSecretRef(newSystemId, 'dbUserInfo');
      credentialsRegistry.push({
        ref: dbUserInfoRef,
        field: 'dbUserInfo',
        systemId: newSystemId,
        legacySeq: row.SEQ,
        value: row.DB_USER_INFO,
      });
    }

    if (row.VPN_FILE_SEQ != null) {
      // File migration must run before this becomes a real MinIO path.
      // Store a placeholder ref; operator replaces after files.ts migration.
      vpnFileRef = `vault://jarvis/systems/${newSystemId}/vpnFile`;
    }

    // ── Insert system_access record (only secret_ref URIs, no plain text) ─
    if (!opts.isDryRun && (loginInfoRef || dbConnectInfoRef || dbUserInfoRef || vpnFileRef)) {
      await pg.query(
        `INSERT INTO system_access (id, system_id, username_ref, connection_string_ref, vpn_file_ref, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (system_id) DO UPDATE
           SET username_ref = EXCLUDED.username_ref,
               connection_string_ref = EXCLUDED.connection_string_ref,
               vpn_file_ref = EXCLUDED.vpn_file_ref,
               updated_at = NOW()`,
        [
          randomUUID(),
          newSystemId,
          loginInfoRef ?? dbUserInfoRef ?? null,   // username_ref (prefer loginInfo)
          dbConnectInfoRef,                         // connection_string_ref
          vpnFileRef,
        ],
      );
    } else if (opts.isDryRun) {
      console.log(
        `  [dry-run] system: ${row.SYS_NM} → ${newSystemId}` +
        ` | loginInfo=${loginInfoRef ?? 'none'}` +
        ` | dbConnect=${dbConnectInfoRef ?? 'none'}`,
      );
    }
  }

  console.log(`  system: ${idMap.count('system')} processed`);
  console.log(`  credentials collected: ${credentialsRegistry.length} entries`);

  // ── Write credentials to SOPS-encrypted file ──────────────────────────────
  // The credentialsRegistry NEVER goes to PostgreSQL.
  // After writing, encrypt with SOPS and shred the plaintext file.
  if (!opts.isDryRun && credentialsRegistry.length > 0) {
    const outPath = resolve(process.cwd(), 'credentials.enc.json');
    const payload = {
      _sops_hint: 'Encrypt this file with: sops --encrypt --age <recipient> credentials.enc.json',
      _warning: 'DELETE THIS PLAINTEXT FILE AFTER ENCRYPTING. Run: shred -u credentials.enc.json',
      migrated_at: new Date().toISOString(),
      credentials: credentialsRegistry.map(({ ref, field, systemId, legacySeq, value }) => ({
        ref,
        field,
        systemId,
        legacySeq,
        value,  // plain text — only lives in this file until SOPS-encrypted
      })),
    };

    writeFileSync(outPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    console.log(`  IMPORTANT: credentials written to ${outPath}`);
    console.log(`  NEXT STEP: sops --encrypt --age <recipient> credentials.enc.json`);
    console.log(`  NEXT STEP: shred -u credentials.enc.json`);
  } else if (opts.isDryRun) {
    console.log(`  [dry-run] would write ${credentialsRegistry.length} credential entries to credentials.enc.json`);
  }
}
```

#### `scripts/migrate/validators.ts`

```typescript
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
    'attendance', 'out_manage', 'out_manage_detail',
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

  const orphanAttendance = await pgPool.query(
    `SELECT COUNT(*) AS cnt FROM attendance
     WHERE user_id NOT IN (SELECT id FROM "user")`,
  );
  if (Number(orphanAttendance.rows[0].cnt) > 0) {
    warnings.push(`${orphanAttendance.rows[0].cnt} orphaned attendance rows (missing user)`);
  } else {
    passed.push('attendance FK: all user references resolve');
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
```

---

### Task 8: Knowledge + Audit + Files migration

- [ ] Create `scripts/migrate/knowledge.ts`
- [ ] Create `scripts/migrate/audit-logs.ts` with batch inserts (100k+ row support)
- [ ] Create `scripts/migrate/files.ts` (Oracle BLOB/path → MinIO path placeholder)

#### `scripts/migrate/knowledge.ts`

```typescript
// scripts/migrate/knowledge.ts
import { randomUUID } from 'crypto';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyInfraPage } from './types';

export async function migrateKnowledge(
  oracle: Connection,
  pg: Pool,
  idMap: IdMap,
  opts: MigrationOptions,
): Promise<void> {
  const whereClause = opts.enterCd ? `WHERE ENTER_CD = :enterCd` : '';
  const bindParams = opts.enterCd ? { enterCd: opts.enterCd } : {};

  // TMAN_INFRA_PAGE holds wiki-style content attached to TMAN_INFRA_MANAGE systems.
  const result = await oracle.execute<LegacyInfraPage>(
    `SELECT ENTER_CD, SEQ, MANAGE_SEQ, PAGE_CONTENT, CHK_DATE, CHK_ID
     FROM TMAN_INFRA_PAGE ${whereClause} ORDER BY ENTER_CD, MANAGE_SEQ, SEQ`,
    bindParams,
  );
  const rows = result.rows ?? [];
  console.log(`  oracle: ${rows.length} TMAN_INFRA_PAGE rows`);

  for (const row of rows) {
    const pageId = randomUUID();
    const versionId = randomUUID();
    idMap.set('knowledge_page', `${row.ENTER_CD}:${row.SEQ}`, pageId);

    const workspaceId = idMap.require('workspace', row.ENTER_CD);
    const systemId = idMap.get('system', `${row.ENTER_CD}:${row.MANAGE_SEQ}`) ?? null;
    const authorId = row.CHK_ID
      ? (idMap.get('user', `${row.ENTER_CD}:${row.CHK_ID}`) ?? null)
      : null;
    const updatedAt = row.CHK_DATE instanceof Date ? row.CHK_DATE : new Date();

    if (!opts.isDryRun) {
      // knowledge_page
      await pg.query(
        `INSERT INTO knowledge_page (id, workspace_id, system_id, page_type, publish_status, created_at, updated_at)
         VALUES ($1, $2, $3, 'system', 'published', NOW(), $4)
         ON CONFLICT (id) DO NOTHING`,
        [pageId, workspaceId, systemId, updatedAt],
      );

      // knowledge_page_version (initial version with legacy content as MDX)
      await pg.query(
        `INSERT INTO knowledge_page_version (id, page_id, version, content, author_id, created_at)
         VALUES ($1, $2, 1, $3, $4, $5)
         ON CONFLICT (page_id, version) DO UPDATE SET content = EXCLUDED.content`,
        [versionId, pageId, row.PAGE_CONTENT ?? '', authorId, updatedAt],
      );
    } else {
      console.log(
        `  [dry-run] knowledge_page: ENTER_CD=${row.ENTER_CD} SEQ=${row.SEQ}` +
        ` systemId=${systemId ?? 'none'} contentLen=${row.PAGE_CONTENT?.length ?? 0}`,
      );
    }
  }
  console.log(`  knowledge_page: ${rows.length} processed`);
}
```

#### `scripts/migrate/audit-logs.ts`

```typescript
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
```

#### `scripts/migrate/files.ts`

```typescript
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
```

---

### Task 9: Validation + rollback plan

- [ ] Validate `scripts/migrate/validators.ts` is complete (written in Task 7 above)
- [ ] Document rollback procedure as part of this task
- [ ] Verify security checks throw on plain-text credentials

The complete `validators.ts` code is in Task 7. The rollback procedure is:

```
Rollback (if migration fails or validation errors are found):
  1. Truncate tables in reverse dependency order:
       TRUNCATE audit_log, knowledge_page_version, knowledge_page,
                system_access, system,
                out_manage_detail, out_manage, attendance,
                project_staff, project_inquiry, project_task, project,
                company, code_item, code_group, menu_item,
                user_role, "user", organization, workspace
       RESTART IDENTITY CASCADE;
  2. Fix the issue in the migration script.
  3. Re-run: tsx scripts/migrate-legacy.ts --dry-run
  4. Re-run: tsx scripts/migrate-legacy.ts
  5. Re-run: tsx -e "import('./scripts/migrate/validators.ts').then(m => ...)"
```

The rollback does NOT affect Oracle — it is read-only throughout.

---

### Task 10: Cutover runbook + commit

- [ ] Document cutover procedure in this plan
- [ ] Commit with message: `feat: Oracle → PostgreSQL data migration with credential secret_ref conversion`

#### Cutover Procedure

```
## Day -3: Rehearsal

1. Clone production Oracle DB to a staging Oracle instance.
2. Run dry-run against staging:
     tsx scripts/migrate-legacy.ts --dry-run 2>&1 | tee migration-dry-run.log
   Review logs for errors or unexpected row counts.

3. Run migration against staging PostgreSQL:
     tsx scripts/migrate-legacy.ts 2>&1 | tee migration-staging.log

4. Run validation:
     tsx -e "
       import 'dotenv/config';
       import { Pool } from 'pg';
       import { IdMap } from './scripts/migrate/id-map.js';
       import { validateMigration } from './scripts/migrate/validators.js';
       const pg = new Pool({ connectionString: process.env.DATABASE_URL });
       const idMap = new IdMap();
       validateMigration(pg, idMap).then(r => {
         console.log(r.passed.join('\n'));
         console.warn(r.warnings.join('\n'));
         pg.end();
       });
     "

5. Smoke-test Jarvis staging:
   - Dashboard loads
   - Search returns results
   - One system detail page loads (verify secret_ref visible, NOT plain text)
   - One project with tasks and staff visible
   - Attendance calendar populated

6. Encrypt and destroy the plaintext credentials file:
     sops --encrypt --age <recipient> credentials.enc.json > credentials.enc.sops.json
     shred -u credentials.enc.json
   Verify: credentials.enc.json no longer exists.

## Day 0: Production Cutover

1. Set legacy SSMS to maintenance mode:
     nginx -s reload   # after updating upstream to return 503
   Confirm: https://ssms.internal returns 503.

2. Run final Oracle export (snapshot of live data):
     expdp system/password DIRECTORY=DATA_PUMP_DIR DUMPFILE=ssms_final.dmp LOGFILE=ssms_final.log

3. Run migration against production PostgreSQL:
     tsx scripts/migrate-legacy.ts 2>&1 | tee migration-production.log

4. Run validateMigration (see Day -3 step 4 command above).
   If any SECURITY VIOLATION errors: stop, do NOT update DNS, investigate.

5. Smoke-test Jarvis production:
   - Dashboard: user count, project count match expected
   - Search: one known project title returns correct result
   - System detail: secret_ref URI shown, credential value NOT visible in UI
   - Project detail: tasks, staff, inquiries all populated
   - Attendance: at least one user's calendar shows historical records

6. Update DNS:
     ssms.internal → jarvis.internal
   Confirm propagation: nslookup ssms.internal

7. Monitor for 2 hours:
   - Application logs: no 500 errors
   - pg_stat_activity: no long-running queries
   - OpenSearch indexing queue draining

## Rollback (if issues detected post-DNS switch)

1. Revert DNS:
     ssms.internal → <legacy SSMS IP>
   Confirm propagation.

2. Remove SSMS maintenance mode (restore nginx config, reload).

3. Keep Jarvis running — data stays in PostgreSQL — but SSMS is primary again.

4. Fix the issue, repeat Day -3 rehearsal.
   Do NOT truncate production PostgreSQL until root cause is confirmed.
```

#### Commit

```bash
git add scripts/migrate-legacy.ts scripts/migrate/
git commit -m "feat: Oracle → PostgreSQL data migration with credential secret_ref conversion"
```

---

## Environment Variables Required

```env
# Oracle 11g XE (source)
ORACLE_USER=ssms_readonly
ORACLE_PASSWORD=<secret>
ORACLE_CONNECTION_STRING=10.0.1.5:1521/xe

# PostgreSQL (destination)
DATABASE_URL=postgresql://jarvis:secret@localhost:5432/jarvis

# Optional: limit migration to one workspace
# ENTER_CD is passed as CLI arg: --enter-cd=ACME
```

## Running the Migration

```bash
# Install dependencies
pnpm add -D oracledb pg tsx

# Dry run (preview only, no writes)
tsx scripts/migrate-legacy.ts --dry-run

# Single workspace
tsx scripts/migrate-legacy.ts --enter-cd=ACME

# All workspaces (production run)
tsx scripts/migrate-legacy.ts 2>&1 | tee migration.log

# Post-migration validation only
tsx scripts/migrate/validators.ts
```

## Security Checklist

- [ ] `credentials.enc.json` encrypted with SOPS before storing
- [ ] Plaintext `credentials.enc.json` shredded after encryption
- [ ] `system_access.username_ref` contains only `vault://` URIs
- [ ] `system_access.connection_string_ref` contains only `vault://` URIs
- [ ] Oracle connection uses a read-only service account (`ssms_readonly`)
- [ ] Migration logs do not contain credential values (grep `credentials.enc.json` content)
- [ ] `credentials.enc.json` added to `.gitignore`
