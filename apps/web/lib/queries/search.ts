// apps/web/lib/queries/search.ts
import { PgSearchAdapter } from '@jarvis/search/pg-search';
import type { SearchQuery, SearchResult } from '@jarvis/search/types';
import { embedSearchQuery } from '@/lib/server/search-embedder';

const adapter = new PgSearchAdapter({ embedQuery: embedSearchQuery });

/**
 * Execute a search directly via the adapter (server-side only).
 * Used from Server Components to avoid internal HTTP round-trips.
 */
export async function executeSearch(query: SearchQuery): Promise<SearchResult> {
  return adapter.search(query);
}
