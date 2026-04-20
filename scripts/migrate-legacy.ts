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

    console.log('\n[6/9] systems (credential → secret_ref)');
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
