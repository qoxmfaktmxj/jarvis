// packages/ai/__tests__/graph-context.test.ts
//
// Integration tests for retrieveRelevantGraphContext — explicit scope path.
// Requires a reachable Postgres with the Jarvis schema applied (including
// graph_snapshot scope columns from migration 0004).
//
// The auto-pick path (options.explicitSnapshotId absent) currently returns
// null by design — auto-pick is implemented in Task 3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { retrieveRelevantGraphContext } from '../graph-context.js';

interface SeedSnapshotOpts {
  workspaceId: string;
  scopeType?: 'attachment' | 'project' | 'system' | 'workspace';
  scopeId?: string;
  buildStatus?: 'pending' | 'running' | 'done' | 'error';
  title?: string;
  nodes?: { nodeId: string; label: string }[];
}

async function seedSnapshot(opts: SeedSnapshotOpts): Promise<string> {
  const id = randomUUID();
  const status = opts.buildStatus ?? 'done';
  await db.execute(sql`
    INSERT INTO graph_snapshot
      (id, workspace_id, title, scope_type, scope_id, build_status, analysis_metadata)
    VALUES (
      ${id},
      ${opts.workspaceId},
      ${opts.title ?? 'Test Snapshot'},
      ${opts.scopeType ?? 'workspace'}::graph_scope_type,
      ${opts.scopeId ?? opts.workspaceId}::uuid,
      ${status}::build_status,
      '{}'::jsonb
    )
  `);
  for (const n of opts.nodes ?? []) {
    await db.execute(sql`
      INSERT INTO graph_node (snapshot_id, node_id, label, metadata)
      VALUES (${id}::uuid, ${n.nodeId}, ${n.label}, '{}'::jsonb)
    `);
  }
  return id;
}

async function seedWorkspace(): Promise<string> {
  const id = randomUUID();
  // workspace table uses `code` (unique) + `name` (not null) — not `slug`.
  const code = 'gc-' + id.slice(0, 8);
  await db.execute(sql`
    INSERT INTO workspace (id, code, name)
    VALUES (${id}, ${code}, 'gc-test')
    ON CONFLICT DO NOTHING
  `);
  return id;
}

describe('retrieveRelevantGraphContext — explicit scope', () => {
  let wsA: string;
  let wsB: string;

  beforeEach(async () => {
    wsA = await seedWorkspace();
    wsB = await seedWorkspace();
  });

  afterEach(async () => {
    await db.execute(
      sql`DELETE FROM graph_snapshot WHERE workspace_id IN (${wsA}::uuid, ${wsB}::uuid)`,
    );
    await db.execute(
      sql`DELETE FROM workspace WHERE id IN (${wsA}::uuid, ${wsB}::uuid)`,
    );
  });

  it('returns context when explicit id is valid, in workspace, and done', async () => {
    const snapshotId = await seedSnapshot({
      workspaceId: wsA,
      nodes: [{ nodeId: 'n1', label: 'UserService' }],
    });

    const ctx = await retrieveRelevantGraphContext(
      'tell me about UserService',
      wsA,
      { explicitSnapshotId: snapshotId },
    );

    expect(ctx).not.toBeNull();
    expect(ctx?.snapshotId).toBe(snapshotId);
    expect(ctx?.snapshotTitle).toBe('Test Snapshot');
  });

  it('returns null when explicit id belongs to another workspace', async () => {
    const snapshotId = await seedSnapshot({ workspaceId: wsB });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });

  it('returns null when explicit snapshot is in running state', async () => {
    const snapshotId = await seedSnapshot({
      workspaceId: wsA,
      buildStatus: 'running',
    });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });

  it('returns null when explicit snapshot is in error state', async () => {
    const snapshotId = await seedSnapshot({
      workspaceId: wsA,
      buildStatus: 'error',
    });

    const ctx = await retrieveRelevantGraphContext('q', wsA, {
      explicitSnapshotId: snapshotId,
    });

    expect(ctx).toBeNull();
  });
});
