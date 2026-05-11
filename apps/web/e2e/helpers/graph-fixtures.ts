// apps/web/e2e/helpers/graph-fixtures.ts
// Inserts and cleans up graph_snapshot rows for E2E tests.
// Uses pg directly (same DSN as the app) to avoid circular imports.
//
// Step 2D (2026-05-11): graph_snapshot.sensitivity 제거 (D2=B) — sensitivity 컬럼
// INSERT 삭제 (테스트 입력에서도 더 이상 받지 않음).

import pg from 'pg';
import { randomUUID } from 'crypto';

const DB_URL = process.env.DATABASE_URL || 'postgresql://jarvis:jarvispass@localhost:5436/jarvis';
// Must match TEST_WORKSPACE_ID in apps/web/e2e/helpers/auth.ts — the workspace_id
// column is `uuid`, so non-UUID values raise Postgres 22P02.
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export interface FixtureSnapshot {
  id: string;
  title: string;
  buildStatus: 'pending' | 'running' | 'done' | 'error';
}

export async function createTestSnapshot(
  overrides: Partial<{
    id: string;
    title: string;
    buildStatus: 'pending' | 'running' | 'done' | 'error';
    buildMode: string;
    buildError: string | null;
  }> = {},
): Promise<FixtureSnapshot> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  const id = overrides.id ?? randomUUID();
  const title = overrides.title ?? `E2E Snapshot ${id.slice(0, 8)}`;
  const buildStatus = overrides.buildStatus ?? 'done';

  try {
    await client.query(
      `INSERT INTO workspace (id, code, name)
       VALUES ('00000000-0000-0000-0000-000000000001', 'e2e-test-workspace', 'E2E Test Workspace')
       ON CONFLICT DO NOTHING`,
    );
    await client.query(
      `INSERT INTO graph_snapshot
         (id, workspace_id, title, build_mode, build_status, build_error,
          scope_type, scope_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'workspace', $2, NOW(), NOW())`,
      [
        id,
        WORKSPACE_ID,
        title,
        overrides.buildMode ?? 'full',
        buildStatus,
        overrides.buildError ?? null,
      ],
    );
  } finally {
    await client.end();
  }

  return { id, title, buildStatus };
}

export async function deleteTestSnapshot(id: string): Promise<void> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM graph_snapshot WHERE id = $1', [id]);
  } finally {
    await client.end();
  }
}
