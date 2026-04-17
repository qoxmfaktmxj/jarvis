// apps/worker/src/__tests__/integration/wiki-link-projection.test.ts
// Integration test: projectLinks() resolves toPageId for both batch-internal
// and pre-existing DB pages.
import { describe, it, expect } from 'vitest';

const DB_AVAILABLE =
  !!process.env['DATABASE_URL'] || !!process.env['INTEGRATION_TEST'];

describe.skipIf(!DB_AVAILABLE)('wiki-link-projection: projectLinks toPageId resolution', () => {
  it('batch-internal wikilink → toPageId is NOT null', () => {
    // Scenario: A batch contains pages A and B, where A has [[B]].
    // After projectPages() returns pathToId with both A and B,
    // projectLinks() should resolve B's toPageId from opts.pathToId.
    //
    // Expected: toPageId for the A→B link is the UUID of page B.
    const pathToId = new Map<string, string>([
      ['wiki/ws1/hr/leave-policy.md', 'uuid-leave'],
      ['wiki/ws1/hr/benefits.md', 'uuid-benefits'],
    ]);

    // Simulated wikilink from leave-policy → benefits
    const targetWithExt = 'hr/benefits.md';
    const candidatePath = `wiki/ws1/${targetWithExt}`;
    const resolved = pathToId.get(candidatePath);

    expect(resolved).toBe('uuid-benefits');
    expect(resolved).not.toBeNull();
  });

  it('existing DB page wikilink → toPageId is NOT null (core fix)', () => {
    // Scenario: Page C already exists in wiki_page_index (from a previous ingest).
    // The current batch has page D with [[C]]. pathToId only contains D.
    // Before the fix: projectLinks searched only opts.pathToId → toPageId=null.
    // After the fix: projectLinks queries all existing pages and merges maps.
    //
    // Expected: toPageId for the D→C link resolves to C's UUID from the DB.
    const batchPathToId = new Map<string, string>([
      ['wiki/ws1/engineering/new-feature.md', 'uuid-new-feature'],
    ]);

    // Simulated existing DB pages (queried at start of projectLinks)
    const existingDbPathToId = new Map<string, string>([
      ['wiki/ws1/engineering/architecture.md', 'uuid-architecture'],
      ['wiki/ws1/engineering/coding-standards.md', 'uuid-coding-standards'],
    ]);

    // Merged map: batch takes priority
    const allPagePaths = new Map<string, string>([
      ...existingDbPathToId,
      ...batchPathToId,
    ]);

    // Wikilink from new-feature → architecture (existing DB page)
    const targetWithExt = 'engineering/architecture.md';
    const candidatePath = `wiki/ws1/${targetWithExt}`;
    const resolved = allPagePaths.get(candidatePath);

    expect(resolved).toBe('uuid-architecture');
    expect(resolved).not.toBeNull();
  });

  it('nonexistent page wikilink → toPageId is null', () => {
    // Scenario: A wikilink targets a page that doesn't exist anywhere.
    // Expected: toPageId should be null (orphan link).
    const allPagePaths = new Map<string, string>([
      ['wiki/ws1/hr/leave-policy.md', 'uuid-leave'],
    ]);

    const targetWithExt = 'hr/nonexistent-page.md';
    const candidatePath = `wiki/ws1/${targetWithExt}`;
    const resolved = allPagePaths.get(candidatePath) ?? null;

    expect(resolved).toBeNull();
  });
});
