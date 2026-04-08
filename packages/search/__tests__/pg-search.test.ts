// packages/search/__tests__/pg-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchQuery } from '../types.js';

// Mock @jarvis/db/client so we don't need a real DB in unit tests
vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as unknown as { execute: ReturnType<typeof vi.fn> };

const baseQuery: SearchQuery = {
  q: 'test query',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  userRoles: ['MEMBER'],
  userPermissions: [],
};

describe('PgSearchAdapter', () => {
  let adapter: PgSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PgSearchAdapter();
  });

  describe('suggest', () => {
    it('returns empty array for prefix shorter than 2 chars', async () => {
      const result = await adapter.suggest('a', 'ws-1');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty prefix', async () => {
      const result = await adapter.suggest('', 'ws-1');
      expect(result).toEqual([]);
    });

    it('calls db.execute and merges title and popular results', async () => {
      mockDb.execute
        .mockResolvedValueOnce({ rows: [{ title: 'TypeScript Guide' }] })
        .mockResolvedValueOnce({ rows: [{ query: 'typescript basics' }] });

      const result = await adapter.suggest('type', baseQuery.workspaceId);
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
      expect(result).toContain('TypeScript Guide');
      expect(result).toContain('typescript basics');
    });

    it('deduplicates suggestions and limits to 8', async () => {
      const manyTitles = Array.from({ length: 10 }, (_, i) => ({ title: `Title ${i}` }));
      mockDb.execute
        .mockResolvedValueOnce({ rows: manyTitles })
        .mockResolvedValueOnce({ rows: [] });

      const result = await adapter.suggest('title', baseQuery.workspaceId);
      expect(result.length).toBeLessThanOrEqual(8);
    });
  });

  describe('search', () => {
    it('returns empty result when FTS and fallbacks all return nothing', async () => {
      // All db.execute calls return empty rows
      mockDb.execute.mockResolvedValue({ rows: [] });
      // Mock synonym resolver db.select chain
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await adapter.search(baseQuery);
      expect(result.hits).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('includes explain for admin users', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            id: 'page-1',
            title: 'Test Page',
            page_type: 'WIKI',
            sensitivity: 'INTERNAL',
            updated_at: new Date(),
            fts_rank: 0.9,
            trgm_sim: 0.7,
            headline: 'Test <mark>query</mark> result',
            total_count: '1',
          },
        ],
      });

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const adminQuery: SearchQuery = { ...baseQuery, userRoles: ['ADMIN'] };
      const result = await adapter.search(adminQuery);
      expect(result.explain).toBeDefined();
      expect(result.explain?.length).toBeGreaterThan(0);
    });

    it('does not include explain for non-admin users', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await adapter.search(baseQuery); // userRoles: ['MEMBER']
      expect(result.explain).toBeUndefined();
    });
  });
});
