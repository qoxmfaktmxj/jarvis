// packages/search/hybrid-ranker.ts

/**
 * Compute a freshness score based on how many days ago a document was updated.
 *
 *   < 7 days  → 1.0   (very fresh)
 *   < 30 days → 0.8   (recent)
 *   < 90 days → 0.5   (somewhat stale)
 *   >= 90 days → 0.2  (stale)
 */
export function freshnessScore(days: number): number {
  if (days < 7) return 1.0;
  if (days < 30) return 0.8;
  if (days < 90) return 0.5;
  return 0.2;
}

/**
 * Compute hybrid relevance score.
 *
 * Legacy 3-lane mode (vectorSim omitted):
 *   - FTS rank (ts_rank_cd result, 0–1 range)         weight 0.6
 *   - trgm similarity (pg_trgm similarity(), 0–1)      weight 0.3
 *   - freshness score (computed from updatedAt days)   weight 0.1
 *
 * Phase-W5 4-lane mode (vectorSim provided):
 *   - FTS rank                                         weight 0.4
 *   - vector cosine similarity (1 - distance)          weight 0.35
 *   - trgm similarity                                   weight 0.15
 *   - freshness score                                   weight 0.1
 *
 * The 4-lane mode only activates when caller passes the 4th argument, so
 * existing 3-arg callers (`runFtsSearch`, `runTrgmSearch`) retain identical
 * behaviour. Returns a value in [0, 1].
 */
export function computeHybridScore(
  ftsRank: number,
  trgmSim: number,
  freshnessDays: number,
  vectorSim?: number,
): number {
  const fs = freshnessScore(freshnessDays);
  const score =
    vectorSim === undefined
      ? ftsRank * 0.6 + trgmSim * 0.3 + fs * 0.1
      : ftsRank * 0.4 + vectorSim * 0.35 + trgmSim * 0.15 + fs * 0.1;
  return Math.min(1, Math.max(0, score));
}

/**
 * Compute the number of days between a past date and today.
 */
export function daysSince(updatedAt: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - updatedAt.getTime()) / msPerDay);
}
