// apps/web/lib/queries/precedent-search.ts
// Phase-W5: server-side Lane B executor mirroring lib/queries/search.ts.
import { PrecedentSearchAdapter } from '@jarvis/search/precedent-search';
import type { SearchQuery, SearchResult } from '@jarvis/search/types';
import { embedSearchQuery } from '@/lib/server/search-embedder';

const adapter = new PrecedentSearchAdapter({ embedQuery: embedSearchQuery });

/**
 * Executes Lane B (precedent_case) search directly via adapter.
 * Used by `/search?resourceType=case` server route to avoid HTTP round-trip.
 */
export async function executePrecedentSearch(query: SearchQuery): Promise<SearchResult> {
  return adapter.search(query);
}
