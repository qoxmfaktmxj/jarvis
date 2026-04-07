// packages/search/explain.ts
import type { SearchHit, ScoreExplain } from './types.js';

/**
 * Build score explain records from search hits for admin debug view.
 * Only called when the requesting user has ADMIN or DEVELOPER role.
 */
export function buildExplain(hits: SearchHit[]): ScoreExplain[] {
  return hits.map((hit) => ({
    id: hit.id,
    ftsRank: hit.ftsRank,
    trgmSim: hit.trgmSim,
    freshness: hit.freshness,
    hybridScore: hit.hybridScore,
  }));
}

/**
 * Check if user roles include an admin-level role that grants explain access.
 */
export function canExplain(userRoles: string[]): boolean {
  return userRoles.some((r) =>
    ['ADMIN', 'DEVELOPER', 'SYSTEM_ADMIN'].includes(r.toUpperCase()),
  );
}
