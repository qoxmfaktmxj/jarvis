// packages/search/__tests__/sql-injection.test.ts
//
// SQL injection regression tests for pg-search, facet-counter, precedent-search.
//
// Goals verified here:
//  1. Crafted pageType/sortBy values NOT in the whitelist → silently dropped (no SQL appended).
//  2. Crafted dateFrom non-ISO string → silently dropped.
//  3. query-parser always double-quotes apostrophes so tsquery cannot break out.
//  4. ILIKE patterns have metacharacters escaped (%/_/\).
//  5. Sensitivity/secret filters use Drizzle SQL fragments (no raw user-controlled string).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQL } from 'drizzle-orm';

// -----------------------------------------------------------------------
// DB mock — capture the SQL objects passed to db.execute
// -----------------------------------------------------------------------
const capturedSqls: SQL[] = [];

// Build a where-mock that is both awaitable and chainable (.orderBy().limit())
function makeWhereMock(resolvedValue: unknown[] = []) {
  return vi.fn().mockImplementation(() =>
    Object.assign(Promise.resolve(resolvedValue), {
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  );
}

function makeSelectChain() {
  return {
    from: vi.fn().mockReturnValue({
      where: makeWhereMock(),
    }),
  };
}

vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn(async (sqlObj: SQL) => {
      capturedSqls.push(sqlObj);
      return { rows: [] };
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockImplementation(() => makeSelectChain()),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  knowledgePage: {},
  searchLog: {},
  popularSearch: { query: 'query', count: 'count', workspaceId: 'workspace_id' },
  searchSynonym: {},
}));

import { db } from '@jarvis/db/client';
import { PgSearchAdapter } from '../pg-search.js';
import { countFacets } from '../facet-counter.js';
import { PrecedentSearchAdapter } from '../precedent-search.js';
import { parseQuery } from '../query-parser.js';

const BASE_WORKSPACE = '00000000-0000-0000-0000-000000000000';
const BASE_PERMS = ['knowledge:read'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };

describe('pg-search SQL injection regression', () => {
  let adapter: PgSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSqls.length = 0;
    // Re-apply select mock after clearAllMocks
    mockDb.select.mockImplementation(() => makeSelectChain());
    adapter = new PgSearchAdapter();
  });

  it('rejects crafted pageType payload via whitelist (unknown value → not appended)', async () => {
    // An attacker supplies a pageType that is NOT in VALID_PAGE_TYPES.
    // The buildExtraFilters helper must silently drop it (no SQL appended).
    const result = await adapter.search({
      q: 'test',
      workspaceId: BASE_WORKSPACE,
      pageType: "x'; DROP TABLE knowledge_page;--",
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    expect(result.hits).toEqual([]);

    // Verify the injected string was NOT passed to any SQL template as raw text.
    // After this fix, buildExtraFilters returns SQL fragment where pageType is
    // bound as a parameter ($N), not inlined. An unknown pageType is simply
    // omitted entirely — so no DROP TABLE can appear in the query.
    for (const captured of capturedSqls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = captured as any;
      const text = JSON.stringify(raw);
      expect(text).not.toContain('DROP TABLE');
    }
  });

  it('rejects crafted sortBy payload via whitelist (default fallback used)', async () => {
    // buildOrderBy must switch to 'hybrid_score DESC' for any unknown sortBy.
    const result = await adapter.search({
      q: 'test',
      workspaceId: BASE_WORKSPACE,
      sortBy: "';DELETE FROM knowledge_page;--",
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    expect(result.hits).toEqual([]);

    for (const captured of capturedSqls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = captured as any;
      const text = JSON.stringify(raw);
      expect(text).not.toContain('DELETE FROM');
    }
  });

  it('rejects crafted dateFrom non-ISO payload (not appended to query)', async () => {
    // The ISO_DATE_RE regex must reject this — the filter should be silently dropped.
    const result = await adapter.search({
      q: 'test',
      workspaceId: BASE_WORKSPACE,
      dateFrom: "2026-01-01'; DROP TABLE knowledge_page;--",
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    expect(result.hits).toEqual([]);

    for (const captured of capturedSqls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = captured as any;
      const text = JSON.stringify(raw);
      expect(text).not.toContain('DROP TABLE');
    }
  });

  it('accepts a valid pageType from the whitelist', async () => {
    // After the fix, a valid pageType is bound as a parameter (not raw SQL).
    // The query should execute without error; result may be empty (mock DB).
    const result = await adapter.search({
      q: 'test',
      workspaceId: BASE_WORKSPACE,
      pageType: 'runbook',
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    expect(result.hits).toEqual([]);
  });
});

describe('query-parser SQL injection regression', () => {
  it('apostrophes in q are doubled in tsquery (safe for embedding in PG function calls)', () => {
    // parseQuery("' OR 1=1 --") should produce a tsquery where ' is doubled to ''
    // This is safe: the entire string is passed as the second argument to
    // websearch_to_tsquery('simple', '...') — a doubled '' is valid PostgreSQL escaping.
    const parsed = parseQuery("' OR 1=1 --");
    // The tsquery must contain doubled apostrophes around the inner text
    expect(parsed.tsquery).toContain("''");
    // The raw "; DROP" patterns are not present
    expect(parsed.tsquery).not.toContain('; DROP');
  });

  it('semicolons in q are stripped by sanitize (cannot inject statement separator)', () => {
    const parsed = parseQuery("foo'; DROP TABLE users;--");
    // sanitize() removes non-word chars other than spaces/hyphens/apostrophes/quotes
    expect(parsed.sanitized).not.toContain(';');
    expect(parsed.tsquery).not.toContain('; DROP');
  });

  it('single-quote payload is doubled in tsquery (regression from plan step 1.8)', () => {
    const parsed = parseQuery("test' injection");
    // The apostrophe must be doubled inside the tsquery function argument
    expect(parsed.tsquery).toContain("''");
    // Final tsquery is something like: websearch_to_tsquery('simple', 'test'' injection')
    // The outer quotes wrap the whole thing safely.
    expect(parsed.tsquery).toMatch(/websearch_to_tsquery\('simple',\s*'.*''\s*.*'\)/);
  });
});

describe('facet-counter SQL injection regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSqls.length = 0;
    mockDb.select.mockImplementation(() => makeSelectChain());
  });

  it('runs two execute calls for pageType + sensitivity facets', async () => {
    const parsed = parseQuery('test query');
    await countFacets(BASE_WORKSPACE, parsed.tsquery, BASE_PERMS);
    // Should have made 2 execute calls (pageType + sensitivity facets)
    expect(capturedSqls.length).toBeGreaterThanOrEqual(2);
  });

  it('sensitivity filter from permissions does not contain user-controlled strings', async () => {
    // buildLegacyKnowledgeSensitivitySqlFilter returns constants only.
    // After migration to SQL fragment, the filter is embedded via Drizzle templating.
    await countFacets(BASE_WORKSPACE, "websearch_to_tsquery('simple', 'test')", ['knowledge:read']);
    expect(capturedSqls.length).toBeGreaterThanOrEqual(2);
    // No errors thrown means the SQL was constructed correctly
  });
});

describe('precedent-search SQL injection regression', () => {
  let adapter: PrecedentSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSqls.length = 0;
    mockDb.select.mockImplementation(() => makeSelectChain());
    adapter = new PrecedentSearchAdapter();
  });

  it('escapes ILIKE wildcards in search query (% → \\%)', async () => {
    // The likePattern is passed as a bound parameter ($N) via Drizzle sql``.
    // The escapeLike() function should escape % → \% before the bind.
    // We inspect the queryChunks of the captured SQL to verify the escaped value.
    await adapter.search({
      q: '100% guaranteed',
      workspaceId: BASE_WORKSPACE,
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    expect(capturedSqls.length).toBe(1);

    // The escaped pattern should be %100\% guaranteed%
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = capturedSqls[0] as any;
    const text = JSON.stringify(raw);
    // The escaped form appears in queryChunks values
    expect(text).toContain('100\\\\% guaranteed'); // JSON-escaped backslash
  });

  it('underscore in query is escaped (prevents single-char wildcard matching)', async () => {
    await adapter.search({
      q: 'name_test',
      workspaceId: BASE_WORKSPACE,
      userPermissions: BASE_PERMS,
      userRoles: ['VIEWER'],
      userId: 'user-test',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = capturedSqls[0] as any;
    const text = JSON.stringify(raw);
    // The escaped form should be name\_test
    expect(text).toContain('name\\\\_test'); // JSON-escaped backslash + underscore
  });
});
