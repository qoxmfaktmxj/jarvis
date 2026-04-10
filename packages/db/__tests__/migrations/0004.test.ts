import { describe, it, expect } from 'vitest';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

describe('migration 0004 — graphify scope & upsert', () => {
  it('graph_scope_type enum exists with expected values', async () => {
    const rows = await db.execute<{ enumlabel: string }>(sql`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = 'graph_scope_type'::regtype
      ORDER BY enumsortorder
    `);
    expect(rows.rows.map((r) => r.enumlabel)).toEqual([
      'attachment', 'project', 'system', 'workspace',
    ]);
  });

  it('graph_snapshot has scope_type and scope_id columns', async () => {
    const rows = await db.execute<{ column_name: string; is_nullable: string }>(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'graph_snapshot'
        AND column_name IN ('scope_type', 'scope_id')
      ORDER BY column_name
    `);
    expect(rows.rows).toEqual([
      { column_name: 'scope_id', is_nullable: 'NO' },
      { column_name: 'scope_type', is_nullable: 'NO' },
    ]);
  });

  it('knowledge_page partial unique index allows NULL source_type duplicates', async () => {
    const wsId = randomUUID();
    await db.execute(sql`INSERT INTO workspace (id, name, slug) VALUES (${wsId}, 'test', ${'test-' + wsId.slice(0,8)}) ON CONFLICT DO NOTHING`);

    await db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status)
      VALUES
        (${randomUUID()}, ${wsId}, 'wiki', 'p1', ${'slug-' + randomUUID().slice(0,8)}, 'draft'),
        (${randomUUID()}, ${wsId}, 'wiki', 'p2', ${'slug-' + randomUUID().slice(0,8)}, 'draft')
    `);
    expect(true).toBe(true);
  });

  it('knowledge_page partial unique index rejects duplicate (workspace, source_type, source_key)', async () => {
    const wsId = randomUUID();
    await db.execute(sql`INSERT INTO workspace (id, name, slug) VALUES (${wsId}, 'test2', ${'test2-' + wsId.slice(0,8)}) ON CONFLICT DO NOTHING`);
    const srcKey = 'attachment:abc:GRAPH_REPORT.md';

    await db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status, source_type, source_key)
      VALUES (${randomUUID()}, ${wsId}, 'analysis', 'r1', ${'s1-' + randomUUID().slice(0,8)}, 'published', 'graphify', ${srcKey})
    `);

    await expect(db.execute(sql`
      INSERT INTO knowledge_page (id, workspace_id, page_type, title, slug, publish_status, source_type, source_key)
      VALUES (${randomUUID()}, ${wsId}, 'analysis', 'r2', ${'s2-' + randomUUID().slice(0,8)}, 'published', 'graphify', ${srcKey})
    `)).rejects.toThrow(/unique/i);
  });
});
