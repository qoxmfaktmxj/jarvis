// scripts/migrate/systems.ts
//
// SECURITY CRITICAL: TMAN_INFRA_MANAGE stores credentials in plain text.
// This module:
//   1. Reads credentials from Oracle (loginInfo, dbConnectInfo, dbUserInfo).
//   2. Generates a vault:// secret_ref URI for each non-empty credential.
//   3. Writes ONLY the secret_ref URI to PostgreSQL — never the raw value.
//   4. Accumulates { ref, value } pairs in credentialsRegistry.
//   5. At the end, SOPS-encrypts the registry to credentials.enc.json:
//      a. Aborts if `sops` binary is not found on PATH (unless --no-secrets).
//      b. Writes plaintext to a temp file (credentials.plaintext.tmp in os.tmpdir()).
//      c. Runs: sops --encrypt credentials.plaintext.tmp > credentials.enc.json
//      d. Securely deletes the temp file in a finally block:
//           Unix: shred -u (if available), else overwrite + unlink.
//           Windows: overwrite with random bytes + fsync + unlink.
//
// Run flags (passed via MigrationOptions):
//   --dry-run        : preview without writing to DB or disk.
//   --no-secrets     : skip credential file entirely (useful when vault
//                      population is handled by a separate pipeline).
//   --force          : overwrite credentials.enc.json if it already exists.

import { randomUUID } from 'crypto';
import { writeFileSync, existsSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import type { Connection } from 'oracledb';
import type { Pool } from 'pg';
import type { IdMap } from './id-map';
import type { MigrationOptions } from '../migrate-legacy';
import type { LegacyInfraManage } from './types';

// ── SOPS helpers ─────────────────────────────────────────────────────────────

/** Returns true if `sops` is available on PATH. */
function isSopsAvailable(): boolean {
  const result = spawnSync('sops', ['--version'], { encoding: 'utf8', timeout: 5000 });
  return result.status === 0;
}

/**
 * Securely overwrites `filePath` with random bytes then unlinks it.
 * On Unix tries `shred -u` first; falls back to manual overwrite + unlink.
 * On Windows always does manual overwrite + fsync + unlink.
 */
function secureDelete(filePath: string): void {
  if (process.platform !== 'win32') {
    // Try shred first (Linux coreutils)
    const shred = spawnSync('shred', ['-u', filePath], { timeout: 10000 });
    if (shred.status === 0) return;
  }
  // Fallback (Windows or no shred): overwrite with random bytes then unlink
  try {
    const { randomBytes } = require('crypto') as typeof import('crypto');
    const { statSync } = require('fs') as typeof import('fs');
    const size = statSync(filePath).size;
    const fd = openSync(filePath, 'r+');
    try {
      writeSync(fd, randomBytes(Math.max(size, 1)));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // If we can't overwrite, still attempt unlink below
  }
  unlinkSync(filePath);
}

/**
 * Writes `payload` to a temp file, encrypts it via SOPS to `outPath`,
 * then securely deletes the temp file.
 *
 * @throws if sops exits non-zero or if outPath already exists and !force.
 */
function writeEncryptedCredentials(payload: unknown, outPath: string, force: boolean): void {
  if (existsSync(outPath) && !force) {
    throw new Error(
      `credentials.enc.json already exists at ${outPath}. ` +
      `Pass --force to overwrite, or delete it manually.`,
    );
  }

  const tmpPath = join(tmpdir(), `credentials.plaintext.tmp`);
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  try {
    // sops --encrypt reads the input file and writes encrypted JSON to stdout.
    // We redirect stdout to the final output file via spawnSync stdio.
    const result = spawnSync(
      'sops',
      ['--encrypt', tmpPath],
      {
        encoding: 'buffer',
        timeout: 30000,
        maxBuffer: 50 * 1024 * 1024, // 50 MB
      },
    );

    if (result.status !== 0) {
      const stderr = result.stderr?.toString('utf8') ?? '';
      throw new Error(`sops encryption failed (exit ${result.status ?? 'null'}): ${stderr.trim()}`);
    }

    // Write the encrypted output atomically (same mode restriction)
    writeFileSync(outPath, result.stdout, { mode: 0o600 });
  } finally {
    // Always remove the plaintext temp file, even on error
    try {
      secureDelete(tmpPath);
    } catch (cleanupErr) {
      console.error(`[WARN] Failed to securely delete temp file ${tmpPath}:`, cleanupErr);
      console.error(`[WARN] Please manually delete: ${tmpPath}`);
    }
  }
}

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
  // Flow:
  //   1. Abort (or skip) if sops is not on PATH.
  //   2. Write plaintext to a non-misleading temp file in os.tmpdir().
  //   3. Encrypt via `sops --encrypt` → credentials.enc.json.
  //   4. Securely delete the temp file in a finally block.
  if (opts.isDryRun) {
    console.log(`  [dry-run] would write ${credentialsRegistry.length} credential entries to credentials.enc.json`);
    return;
  }

  if (credentialsRegistry.length === 0) {
    console.log(`  no credentials to write.`);
    return;
  }

  if (opts.noSecrets) {
    console.log(`  [--no-secrets] skipping credential file write (${credentialsRegistry.length} entries discarded).`);
    return;
  }

  // Guard: SOPS must be available before we touch any credentials on disk.
  if (!isSopsAvailable()) {
    throw new Error(
      'SOPS required to write credentials. ' +
      'Install sops (https://github.com/getsops/sops) or pass --no-secrets to skip credentials.',
    );
  }

  const outPath = resolve(process.cwd(), 'credentials.enc.json');
  const payload = {
    migrated_at: new Date().toISOString(),
    credentials: credentialsRegistry.map(({ ref, field, systemId, legacySeq, value }) => ({
      ref,
      field,
      systemId,
      legacySeq,
      value,
    })),
  };

  writeEncryptedCredentials(payload, outPath, opts.force ?? false);
  console.log(`  credentials encrypted and written to ${outPath}`);
}
