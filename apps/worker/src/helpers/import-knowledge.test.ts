import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// These are integration tests that require a live Postgres database.
// Skip the entire suite when DATABASE_URL is not configured so CI can
// run unit tests without a running DB. Set DATABASE_URL to run locally.
const HAS_DB = Boolean(process.env.DATABASE_URL);

// boss.ts throws at module-load time without DATABASE_URL.
// Mock it before importing anything that transitively imports boss.
vi.mock('../lib/boss.js', () => ({
  boss: { send: vi.fn().mockResolvedValue('') },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any, knowledgePage: any, sql: any, eq: any, importAsKnowledgePage: any, boss: any;
if (HAS_DB) {
  const dbMod = await import('@jarvis/db/client');
  const schemaMod = await import('@jarvis/db/schema/knowledge');
  const ormMod = await import('drizzle-orm');
  const importMod = await import('./import-knowledge.js');
  const bossMod = await import('../lib/boss.js');
  db = dbMod.db;
  knowledgePage = schemaMod.knowledgePage;
  sql = ormMod.sql;
  eq = ormMod.eq;
  importAsKnowledgePage = importMod.importAsKnowledgePage;
  boss = bossMod.boss;
}

async function seedWs(): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO workspace (id, code, name)
    VALUES (${id}, ${'ik-' + id.slice(0, 8)}, 'ik-test')
    ON CONFLICT DO NOTHING
  `);
  return id;
}

describe.skipIf(!HAS_DB)('importAsKnowledgePage — upsert (integration)', () => {
  let wsId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(async () => {
    wsId = await seedWs();
    sendSpy = vi.spyOn(boss, 'send').mockResolvedValue('' as never);
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM knowledge_page WHERE workspace_id = ${wsId}::uuid`);
    await db.execute(sql`DELETE FROM workspace WHERE id = ${wsId}::uuid`);
    sendSpy.mockRestore();
  });

  const baseParams = (overrides: Partial<Parameters<typeof importAsKnowledgePage>[0]> = {}) => ({
    workspaceId: wsId,
    title: 'Graph Report',
    slug: 'graph-report',
    mdxContent: '# hello',
    pageType: 'analysis',
    sensitivity: 'INTERNAL',
    createdBy: null,
    sourceType: 'graphify',
    sourceKey: 'attachment:a:GRAPH_REPORT.md',
    ...overrides,
  });

  it('creates a new page and version on first import', async () => {
    const r = await importAsKnowledgePage(baseParams());
    expect(r.wasCreated).toBe(true);
    expect(r.wasUpdated).toBe(true);
    expect(r.versionNumber).toBe(1);
    expect(sendSpy).toHaveBeenCalledWith('compile', { pageId: r.pageId });
  });

  it('creates a new version on rebuild with changed content', async () => {
    const first = await importAsKnowledgePage(baseParams({ mdxContent: 'v1' }));
    sendSpy.mockClear();
    const second = await importAsKnowledgePage(baseParams({ mdxContent: 'v2' }));
    expect(second.pageId).toBe(first.pageId);
    expect(second.wasCreated).toBe(false);
    expect(second.wasUpdated).toBe(true);
    expect(second.versionNumber).toBe(2);
    expect(sendSpy).toHaveBeenCalledWith('compile', { pageId: first.pageId });
  });

  it('skips compile on rebuild with identical content', async () => {
    const first = await importAsKnowledgePage(baseParams({ mdxContent: 'same' }));
    sendSpy.mockClear();
    const second = await importAsKnowledgePage(baseParams({ mdxContent: 'same' }));
    expect(second.pageId).toBe(first.pageId);
    expect(second.wasCreated).toBe(false);
    expect(second.wasUpdated).toBe(false);
    expect(second.versionNumber).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('preserves user-set publishStatus across rebuilds', async () => {
    const { pageId } = await importAsKnowledgePage(baseParams({ mdxContent: 'original' }));
    // Simulate user unpublishing
    await db.update(knowledgePage).set({ publishStatus: 'draft' }).where(eq(knowledgePage.id, pageId));

    // Rebuild with new content
    await importAsKnowledgePage(baseParams({ mdxContent: 'updated' }));

    const [page] = await db
      .select({ publishStatus: knowledgePage.publishStatus })
      .from(knowledgePage)
      .where(eq(knowledgePage.id, pageId));
    expect(page?.publishStatus).toBe('draft');
  });

  it('different sourceKey creates different pages', async () => {
    const r1 = await importAsKnowledgePage(baseParams({ sourceKey: 'attachment:a:file1.md', slug: 'f1' }));
    const r2 = await importAsKnowledgePage(baseParams({ sourceKey: 'attachment:a:file2.md', slug: 'f2' }));
    expect(r1.pageId).not.toBe(r2.pageId);
  });
});
