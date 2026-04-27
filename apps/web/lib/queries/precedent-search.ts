// apps/web/lib/queries/precedent-search.ts
// Lane B server-side executor. Phase-Harness (2026-04-23) 이후 BM25/trigram 전용.
import { PrecedentSearchAdapter } from '@jarvis/search/precedent-search';
import type { SearchQuery, SearchResult } from '@jarvis/search/types';

const adapter = new PrecedentSearchAdapter({});

/**
 * Executes Lane B (precedent_case) search directly via adapter.
 * Used by `/search?resourceType=case` server route to avoid HTTP round-trip.
 */
export async function executePrecedentSearch(query: SearchQuery): Promise<SearchResult> {
  return adapter.search(query);
}
