// packages/search/fallback-chain.ts
import { db } from '@jarvis/db/client';
import { searchLog, popularSearch } from '@jarvis/db/schema';
import { eq, and, ilike, sql } from 'drizzle-orm';
import type { SearchQuery, SearchResult, SearchFacets, FallbackStep } from './types.js';
import { resolveSynonyms, buildExpandedQuery } from './synonym-resolver.js';

const EMPTY_FACETS: SearchFacets = { byPageType: {}, bySensitivity: {} };

function emptyResult(query: string, durationMs: number, suggestions: string[] = []): SearchResult {
  return {
    hits: [],
    total: 0,
    facets: EMPTY_FACETS,
    suggestions,
    query,
    durationMs,
  };
}

/**
 * FallbackChain executes search steps in order and returns the first
 * non-empty result. Steps: FTS → trgm → synonymExpand → popular.
 *
 * Callers inject runFts and runTrgm to avoid circular dependencies
 * with PgSearchAdapter.
 */
export class FallbackChain {
  constructor(
    private readonly runFts: (query: SearchQuery) => Promise<SearchResult>,
    private readonly runTrgm: (query: SearchQuery) => Promise<SearchResult>,
  ) {}

  async run(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const steps: FallbackStep[] = [];

    // Step 1: FTS
    const ftsResult = await this.runFts(query);
    steps.push({ name: 'fts', used: true, resultCount: ftsResult.hits.length });

    if (ftsResult.hits.length > 0) {
      await this.logSearch(query, ftsResult.hits.length);
      return ftsResult;
    }

    // Step 2: trgm fallback
    const trgmResult = await this.runTrgm(query);
    steps.push({ name: 'trgm', used: true, resultCount: trgmResult.hits.length });

    if (trgmResult.hits.length > 0) {
      await this.logSearch(query, trgmResult.hits.length);
      return trgmResult;
    }

    // Step 3: synonym expansion fallback
    const synonymTerms = await resolveSynonyms(query.q, query.workspaceId);
    if (synonymTerms.length > 1) {
      const expandedQ = buildExpandedQuery(synonymTerms);
      const expandedQuery: SearchQuery = { ...query, q: expandedQ };
      const synResult = await this.runFts(expandedQuery);
      steps.push({ name: 'synonymExpand', used: true, resultCount: synResult.hits.length });

      if (synResult.hits.length > 0) {
        await this.logSearch(query, synResult.hits.length);
        return synResult;
      }
    }

    // Step 4: popular searches as suggestions
    const popularSuggestions = await this.fetchPopularSuggestions(query.workspaceId, query.q);
    steps.push({ name: 'popular', used: true, resultCount: 0 });

    const durationMs = Date.now() - startMs;
    await this.logSearch(query, 0);

    return {
      ...emptyResult(query.q, durationMs, popularSuggestions),
      durationMs,
    };
  }

  private async fetchPopularSuggestions(
    workspaceId: string,
    q: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ query: popularSearch.query })
      .from(popularSearch)
      .where(
        and(
          eq(popularSearch.workspaceId, workspaceId),
          ilike(popularSearch.query, `%${q.substring(0, 20)}%`),
        ),
      )
      .orderBy(sql`${popularSearch.count} DESC`)
      .limit(5);

    return rows.map((r) => r.query);
  }

  private async logSearch(
    query: SearchQuery,
    resultCount: number,
  ): Promise<void> {
    try {
      await db.insert(searchLog).values({
        workspaceId: query.workspaceId,
        userId: query.userId,
        query: query.q,
        resultCount,
      });
    } catch {
      // Non-critical: log failure should not break search
    }
  }
}
