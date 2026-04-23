// packages/search/__tests__/precedent-search.test.ts
// Phase-Harness (2026-04-23): 벡터 검색 제거 후 BM25/trigram 기반 adapter 의
// 단위 테스트. embedQuery 옵션과 vector_sim 필드는 더 이상 존재하지 않는다.

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

describe('PrecedentSearchAdapter (Phase-Harness: BM25/trigram)', () => {
  let adapter: PrecedentSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PrecedentSearchAdapter({});
  });

  it('returns case hits with resourceType "case" and trgmSim populated', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 'case-1',
          title: '연차 신청 오류',
          cluster_label: '근태 / 연차',
          sensitivity: 'INTERNAL',
          updated_at: new Date(),
          trgm_sim: 0.73,
          total_count: '1',
        },
      ],
    });

    const res = await adapter.search(baseQuery);
    expect(res.hits).toHaveLength(1);
    const hit = res.hits[0]!;
    expect(hit.resourceType).toBe('case');
    expect(hit.url).toBe('/cases/case-1');
    expect(hit.trgmSim).toBeCloseTo(0.73, 5);
    expect(hit.hybridScore).toBeCloseTo(0.73, 5);
    expect(hit.headline).toBe('근태 / 연차');
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

  it('short-circuits on empty query without hitting db', async () => {
    const res = await adapter.search({ ...baseQuery, q: '   ' });
    expect(res.hits).toEqual([]);
    expect(res.total).toBe(0);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it('suggest() always returns empty array', async () => {
    const res = await adapter.suggest();
    expect(res).toEqual([]);
  });

  it('escapes LIKE wildcards in the query before building %...% pattern', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    await adapter.search({ ...baseQuery, q: '50% off' });
    const rendered = JSON.stringify(mockDb.execute.mock.calls[0]![0]);
    // %, _, \\ 는 escape 되어 '\%' 형태로 파라미터에 들어가야 한다.
    // (JSON stringify 시 backslash 는 한 번 더 escape 되므로 "\\\\%" 로 나타남)
    expect(rendered).toContain('50\\\\% off');
  });
});
