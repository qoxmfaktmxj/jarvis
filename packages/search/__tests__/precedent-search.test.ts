// packages/search/__tests__/precedent-search.test.ts
// Phase-W5 T7 — unit tests for Lane B (precedent_case) isolation + behaviour.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchQuery } from '../types.js';

vi.mock('@jarvis/db/client', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('@jarvis/db/schema', () => ({}));

import { db } from '@jarvis/db/client';
import { PrecedentSearchAdapter } from '../precedent-search.js';

const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> };

const baseQuery: SearchQuery = {
  q: '연차 오류',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  userRoles: ['MEMBER'],
  userPermissions: [],
};

describe('PrecedentSearchAdapter', () => {
  let adapter: PrecedentSearchAdapter;
  let embedSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    embedSpy = vi.fn().mockResolvedValue(new Array(1536).fill(0.01));
    adapter = new PrecedentSearchAdapter({ embedQuery: embedSpy });
  });

  it('returns case hits with resourceType "case"', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 'case-1',
          title: '연차 신청 오류',
          cluster_label: '근태 / 연차',
          sensitivity: 'INTERNAL',
          updated_at: new Date(),
          vector_sim: 0.88,
          total_count: '1',
        },
      ],
    });

    const res = await adapter.search(baseQuery);
    expect(res.hits).toHaveLength(1);
    const hit = res.hits[0]!;
    expect(hit.resourceType).toBe('case');
    expect(hit.url).toBe('/cases/case-1');
    expect(hit.vectorSim).toBe(0.88);
    expect(hit.headline).toBe('근태 / 연차');
  });

  it('calls embedQuery with the original query string', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    await adapter.search(baseQuery);
    expect(embedSpy).toHaveBeenCalledWith('연차 오류');
    expect(embedSpy).toHaveBeenCalledTimes(1);
  });

  it('never reads knowledge_page (physical Lane A/B isolation)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    await adapter.search(baseQuery);
    const rendered = JSON.stringify(mockDb.execute.mock.calls[0]![0]);
    expect(rendered).not.toMatch(/knowledge_page/i);
    expect(rendered).toMatch(/precedent_case/i);
  });

  it('returns empty hits when no rows match', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    const res = await adapter.search(baseQuery);
    expect(res.hits).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('suggest() always returns empty array', async () => {
    const res = await adapter.suggest();
    expect(res).toEqual([]);
  });
});
