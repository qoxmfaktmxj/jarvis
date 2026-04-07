// packages/ai/ask.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retrieveRelevantClaims } from './ask.js';

vi.mock('./embed.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVectorRows: any = {
  rows: [
    { id: 'c1', claim_text: 'Jarvis is an enterprise portal.', page_id: 'p1', title: 'About Jarvis', distance: 0.1 },
    { id: 'c2', claim_text: 'Access systems via the Systems menu.', page_id: 'p2', title: 'Systems Guide', distance: 0.2 },
    { id: 'c3', claim_text: 'Projects track deliverables.', page_id: 'p3', title: 'Project Docs', distance: 0.3 },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFtsRows: any = {
  rows: [
    { page_id: 'p1', fts_rank: 0.8 },
    { page_id: 'p2', fts_rank: 0.5 },
    { page_id: 'p3', fts_rank: 0.1 },
  ],
};

describe('retrieveRelevantClaims', () => {
  beforeEach(async () => {
    const { db } = await import('@jarvis/db/client');
    vi.mocked(db.execute)
      .mockResolvedValueOnce(mockVectorRows)
      .mockResolvedValueOnce(mockFtsRows);
  });

  it('returns top claims sorted by hybrid score', async () => {
    const claims = await retrieveRelevantClaims('What is Jarvis?', 'ws1', ['member']);
    expect(claims.length).toBeGreaterThan(0);
    // Verify hybrid score ordering: each score >= next
    for (let i = 0; i < claims.length - 1; i++) {
      const a = claims[i];
      const b = claims[i + 1];
      if (a && b) {
        expect(a.hybridScore).toBeGreaterThanOrEqual(b.hybridScore);
      }
    }
  });

  it('computes hybridScore as vectorSim*0.7 + ftsRank*0.3', async () => {
    const claims = await retrieveRelevantClaims('What is Jarvis?', 'ws1', ['member']);
    const c1 = claims.find((c) => c.id === 'c1')!;
    // vectorSim = 1 - 0.1 = 0.9, ftsRank = 0.8
    expect(c1.hybridScore).toBeCloseTo(0.9 * 0.7 + 0.8 * 0.3, 5);
  });
});
