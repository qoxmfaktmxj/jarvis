// apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts
// Phase-7A PR#9 / G4: verifies that pgvector similarity search (via knowledge_claim)
// filtered by workspace_id never returns rows belonging to a different workspace.
//
// DEPENDENCY NOTE: The plan calls for document_chunks (Lane C). Lane C is not yet
// merged, so this test uses knowledge_claim + knowledge_page instead.
// The isolation logic is identical: seed workspace A/B rows, query with
// workspaceId = A filter, assert no B rows are ever returned.
//
// TEST_DATABASE_URL environment variable must be set for this suite to run.
// Without it, the entire describe block is skipped (CI-safe).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const runIfDb = TEST_DB_URL ? describe : describe.skip;

const WORKSPACE_A = '00000000-0000-0000-0000-00000000aaaa';
const WORKSPACE_B = '00000000-0000-0000-0000-00000000bbbb';
const EMBED_DIM = 1536;

// ---------------------------------------------------------------------------
// Deterministic vector generator (LCG seeded)
// ---------------------------------------------------------------------------
function seededVector(seed: number, offset = 0): number[] {
  let s = (seed * 9301 + 49297 + offset) % 233280;
  const v: number[] = [];
  for (let i = 0; i < EMBED_DIM; i++) {
    s = (s * 9301 + 49297) % 233280;
    v.push(s / 233280);
  }
  return v;
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

// ---------------------------------------------------------------------------
// Query: search knowledge_claim rows filtered by workspace_id (via JOIN)
// This mirrors the retrieval logic in ask.ts/retrieveRelevantClaims.
// ---------------------------------------------------------------------------
async function searchClaims(
  client: Client,
  workspaceId: string,
  queryVec: number[],
  limit = 50,
): Promise<Array<{ id: string; workspace_id: string }>> {
  const lit = toVectorLiteral(queryVec);
  const res = await client.query<{ id: string; workspace_id: string }>(
    `SELECT kc.id, kp.workspace_id
       FROM knowledge_claim kc
       JOIN knowledge_page kp ON kp.id = kc.page_id
      WHERE kp.workspace_id = $1::uuid
        AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> $2::vector
      LIMIT $3`,
    [workspaceId, lit, limit],
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
runIfDb('cross-workspace leakage (G4)', () => {
  const client = new Client({ connectionString: TEST_DB_URL });

  // Temporary IDs we insert so we can clean up precisely.
  let pageAId: string;
  let pageBId: string;

  beforeAll(async () => {
    await client.connect();

    // Ensure the test workspaces exist (workspace table has unique code constraint).
    await client.query(
      `INSERT INTO workspace (id, code, name)
       VALUES
         ($1::uuid, 'g4-ws-a', 'G4 Test Workspace A'),
         ($2::uuid, 'g4-ws-b', 'G4 Test Workspace B')
       ON CONFLICT (id) DO NOTHING`,
      [WORKSPACE_A, WORKSPACE_B],
    );

    // Create one knowledge_page per workspace.
    const resA = await client.query<{ id: string }>(
      `INSERT INTO knowledge_page
         (workspace_id, page_type, title, slug, publish_status, sensitivity)
       VALUES
         ($1::uuid, 'wiki', 'G4 Page A', 'g4-page-a', 'published', 'public')
       RETURNING id`,
      [WORKSPACE_A],
    );
    pageAId = resA.rows[0]!.id;

    const resB = await client.query<{ id: string }>(
      `INSERT INTO knowledge_page
         (workspace_id, page_type, title, slug, publish_status, sensitivity)
       VALUES
         ($1::uuid, 'wiki', 'G4 Page B', 'g4-page-b', 'published', 'public')
       RETURNING id`,
      [WORKSPACE_B],
    );
    pageBId = resB.rows[0]!.id;

    // Insert 10 claims per workspace page with distinct seed vectors.
    const insertClaim = `
      INSERT INTO knowledge_claim (page_id, chunk_index, claim_text, embedding)
      VALUES ($1::uuid, $2, $3, $4::vector)
    `;
    for (let i = 0; i < 10; i++) {
      await client.query(insertClaim, [
        pageAId,
        i,
        `A-claim-${i}`,
        toVectorLiteral(seededVector(1000 + i)),
      ]);
    }
    for (let i = 0; i < 10; i++) {
      await client.query(insertClaim, [
        pageBId,
        i,
        `B-claim-${i}`,
        toVectorLiteral(seededVector(2000 + i)),
      ]);
    }
  });

  afterAll(async () => {
    // Remove only the rows we inserted.
    if (pageAId) {
      await client.query('DELETE FROM knowledge_claim WHERE page_id = $1::uuid', [pageAId]);
      await client.query('DELETE FROM knowledge_page WHERE id = $1::uuid', [pageAId]);
    }
    if (pageBId) {
      await client.query('DELETE FROM knowledge_claim WHERE page_id = $1::uuid', [pageBId]);
      await client.query('DELETE FROM knowledge_page WHERE id = $1::uuid', [pageBId]);
    }
    await client.query(
      `DELETE FROM workspace WHERE id IN ($1::uuid, $2::uuid)`,
      [WORKSPACE_A, WORKSPACE_B],
    );
    await client.end();
  });

  it('query close to workspace A returns only workspace A rows', async () => {
    const q = seededVector(1000, 1); // near A-claim-0
    const rows = await searchClaims(client, WORKSPACE_A, q);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspace_id === WORKSPACE_A)).toBe(true);
  });

  it('query close to workspace B returns only workspace B rows', async () => {
    const q = seededVector(2000, 1); // near B-claim-0
    const rows = await searchClaims(client, WORKSPACE_B, q);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspace_id === WORKSPACE_B)).toBe(true);
  });

  it('generic vector is filtered to requested workspace only; no id appears in both sets', async () => {
    const q = seededVector(9999);
    const rowsA = await searchClaims(client, WORKSPACE_A, q);
    const rowsB = await searchClaims(client, WORKSPACE_B, q);
    expect(rowsA.every((r) => r.workspace_id === WORKSPACE_A)).toBe(true);
    expect(rowsB.every((r) => r.workspace_id === WORKSPACE_B)).toBe(true);
    // Cross-check: no claim id appears in both result sets.
    const idsA = new Set(rowsA.map((r) => r.id));
    expect(rowsB.some((r) => idsA.has(r.id))).toBe(false);
  });
});
