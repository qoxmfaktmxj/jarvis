// packages/search/__tests__/rrf-merge.test.ts
// Phase-W5 (review fix): unit tests for the RRF merge used in PgSearchAdapter.search
import { describe, it, expect } from 'vitest';
import { mergeByRRF, RRF_K, assertValidEmbedding } from '../pg-search.js';
import type { SearchHit } from '../types.js';

function makeHit(id: string, extra: Partial<SearchHit> = {}): SearchHit {
  return {
    id,
    resourceType: 'knowledge',
    title: `page ${id}`,
    headline: '',
    updatedAt: new Date('2026-04-01').toISOString(),
    ftsRank: 0,
    trgmSim: 0,
    freshness: 0,
    hybridScore: 0,
    url: `/knowledge/${id}`,
    ...extra,
  };
}

describe('mergeByRRF', () => {
  it('returns empty when both lists are empty', () => {
    expect(mergeByRRF([], [], 10)).toEqual([]);
  });

  it('keeps a single-list result when the other is empty', () => {
    const a = [makeHit('a'), makeHit('b')];
    const out = mergeByRRF(a, [], 10);
    expect(out.map((h) => h.id)).toEqual(['a', 'b']);
    // hybridScore should be the RRF formula result
    expect(out[0]!.hybridScore).toBeCloseTo(1 / (RRF_K + 1), 8);
  });

  it('combines scores for a doc that appears in both lists', () => {
    const a = [makeHit('x'), makeHit('y')];
    const b = [makeHit('y'), makeHit('z')];
    const out = mergeByRRF(a, b, 10);
    const yHit = out.find((h) => h.id === 'y')!;
    // y is rank 2 in A and rank 1 in B → score = 1/(60+2) + 1/(60+1)
    expect(yHit.hybridScore).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 8);
  });

  it('sorts merged hits by descending combined score', () => {
    const a = [makeHit('shared'), makeHit('onlyA')];
    const b = [makeHit('shared'), makeHit('onlyB')];
    const out = mergeByRRF(a, b, 10);
    expect(out[0]!.id).toBe('shared');
  });

  it('respects the limit', () => {
    const a = Array.from({ length: 50 }, (_, i) => makeHit(`a-${i}`));
    const b = Array.from({ length: 50 }, (_, i) => makeHit(`b-${i}`));
    const out = mergeByRRF(a, b, 5);
    expect(out).toHaveLength(5);
  });

  it('prefers the richer hit (with vectorSim) when deduping same id', () => {
    const a = [makeHit('same', { vectorSim: 0 })];
    const b = [makeHit('same', { vectorSim: 0.9 })];
    const out = mergeByRRF(a, b, 10);
    expect(out[0]!.vectorSim).toBe(0.9);
  });
});

describe('assertValidEmbedding', () => {
  it('passes for a length-1536 finite array', () => {
    expect(() => assertValidEmbedding(new Array(1536).fill(0.01))).not.toThrow();
  });

  it('throws on wrong dimension', () => {
    expect(() => assertValidEmbedding(new Array(100).fill(0.01))).toThrow(/length 1536/);
  });

  it('throws when NaN present', () => {
    const v = new Array(1536).fill(0.01);
    v[3] = NaN;
    expect(() => assertValidEmbedding(v)).toThrow(/non-finite/);
  });

  it('throws when Infinity present', () => {
    const v = new Array(1536).fill(0.01);
    v[0] = Infinity;
    expect(() => assertValidEmbedding(v)).toThrow(/non-finite/);
  });

  it('throws when input is not an array', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(() => assertValidEmbedding('nope')).toThrow();
  });
});
