// packages/search/__tests__/hybrid-ranker.test.ts
import { describe, it, expect } from 'vitest';
import { freshnessScore, computeHybridScore, daysSince } from '../hybrid-ranker.js';

describe('freshnessScore', () => {
  it('returns 1.0 for very fresh content (< 7 days)', () => {
    expect(freshnessScore(0)).toBe(1.0);
    expect(freshnessScore(3)).toBe(1.0);
    expect(freshnessScore(6)).toBe(1.0);
  });

  it('returns 0.8 for recent content (7–29 days)', () => {
    expect(freshnessScore(7)).toBe(0.8);
    expect(freshnessScore(15)).toBe(0.8);
    expect(freshnessScore(29)).toBe(0.8);
  });

  it('returns 0.5 for somewhat stale content (30–89 days)', () => {
    expect(freshnessScore(30)).toBe(0.5);
    expect(freshnessScore(60)).toBe(0.5);
    expect(freshnessScore(89)).toBe(0.5);
  });

  it('returns 0.2 for stale content (>= 90 days)', () => {
    expect(freshnessScore(90)).toBe(0.2);
    expect(freshnessScore(365)).toBe(0.2);
    expect(freshnessScore(1000)).toBe(0.2);
  });
});

describe('computeHybridScore', () => {
  it('computes correct weighted sum', () => {
    // ftsRank=1, trgmSim=1, freshnessDays=0 (score=1.0)
    // expected: 1*0.6 + 1*0.3 + 1.0*0.1 = 1.0
    expect(computeHybridScore(1, 1, 0)).toBeCloseTo(1.0, 5);
  });

  it('applies weights correctly for partial scores', () => {
    // ftsRank=0.5, trgmSim=0, freshnessDays=30 (freshness=0.5)
    // expected: 0.5*0.6 + 0*0.3 + 0.5*0.1 = 0.30 + 0 + 0.05 = 0.35
    expect(computeHybridScore(0.5, 0, 30)).toBeCloseTo(0.35, 5);
  });

  it('clamps result to [0, 1]', () => {
    expect(computeHybridScore(2, 2, 0)).toBe(1);
    expect(computeHybridScore(-1, -1, 0)).toBe(0);
  });

  it('freshness-only score is correct', () => {
    // ftsRank=0, trgmSim=0, freshnessDays=5 (freshness=1.0)
    // expected: 0 + 0 + 1.0*0.1 = 0.1
    expect(computeHybridScore(0, 0, 5)).toBeCloseTo(0.1, 5);
  });

  it('pure trgm score is correct', () => {
    // ftsRank=0, trgmSim=0.8, freshnessDays=90 (freshness=0.2)
    // expected: 0 + 0.8*0.3 + 0.2*0.1 = 0.24 + 0.02 = 0.26
    expect(computeHybridScore(0, 0.8, 90)).toBeCloseTo(0.26, 5);
  });
});

describe('daysSince', () => {
  it('returns 0 for current date', () => {
    const now = new Date();
    expect(daysSince(now)).toBe(0);
  });

  it('returns correct days for past date', () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    expect(daysSince(pastDate)).toBe(10);
  });
});
