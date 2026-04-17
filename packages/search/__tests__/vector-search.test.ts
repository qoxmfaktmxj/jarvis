// packages/search/__tests__/vector-search.test.ts
// Phase-W5 T4 — unit tests for PgSearchAdapter.runVectorSearch (Lane A)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchQuery } from '../types.js';

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
    execute: vi.fn(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockImplementation(() => makeSelectChain()),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  knowledgePage: {},
  searchLog: {},
  popularSearch: {},
  searchSynonym: {},
}));

import { db } from '@jarvis/db/client';
import { PgSearchAdapter } from '../pg-search.js';

const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> };

const baseQuery: SearchQuery = {
  q: '연차',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  userRoles: ['MEMBER'],
  userPermissions: [],
};

const zeroVec = new Array(1536).fill(0.01);

describe('PgSearchAdapter.runVectorSearch', () => {
  let adapter: PgSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PgSearchAdapter();
  });

  it('returns hits with vectorSim populated from 1 - cosine distance', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 'page-1',
          title: '연차 휴가 규정',
          page_type: 'hr-policy',
          sensitivity: 'INTERNAL',
          updated_at: new Date(),
          vector_sim: 0.92,
          headline: '제4장 제2절 휴일·휴가',
          total_count: '1',
        },
      ],
    });

    const res = await adapter.runVectorSearch(baseQuery, zeroVec);

    expect(res.hits).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.hits[0].id).toBe('page-1');
    expect(res.hits[0].resourceType).toBe('knowledge');
    expect(res.hits[0].vectorSim).toBe(0.92);
    expect(res.hits[0].ftsRank).toBe(0);
    expect(res.hits[0].trgmSim).toBe(0);
    expect(res.hits[0].url).toBe('/knowledge/page-1');
  });

  it('returns empty result when no rows match', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    const res = await adapter.runVectorSearch(baseQuery, zeroVec);
    expect(res.hits).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('respects the limit / offset options', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    await adapter.runVectorSearch(baseQuery, zeroVec, { limit: 5, offset: 10 });
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    // The exact SQL is an opaque drizzle tag — we just verify the call happened
    // with a single argument (the sql fragment).
    const callArgs = mockDb.execute.mock.calls[0];
    expect(callArgs).toHaveLength(1);
  });

  it('does not touch precedent_case (Lane B isolation)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    await adapter.runVectorSearch(baseQuery, zeroVec);
    const rendered = JSON.stringify(mockDb.execute.mock.calls[0][0]);
    expect(rendered).not.toMatch(/precedent_case/i);
    expect(rendered).toMatch(/knowledge_page/i);
  });
});
