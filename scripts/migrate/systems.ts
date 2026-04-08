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
