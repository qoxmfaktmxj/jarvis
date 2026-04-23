// apps/web/lib/queries/search.ts
import { PgSearchAdapter } from '@jarvis/search/pg-search';
import type { SearchQuery, SearchResult } from '@jarvis/search/types';

// Phase-Harness (2026-04-23): embed 경로 제거. featureSearchHybrid() 가 항상
// false 를 반환하므로 embedQuery 는 호출되지 않지만, adapter 의 optional
// 시그니처를 유지하기 위해 생략.
const adapter = new PgSearchAdapter({});

/**
 * Execute a search directly via the adapter (server-side only).
 * Used from Server Components to avoid internal HTTP round-trips.
 */
export async function executeSearch(query: SearchQuery): Promise<SearchResult> {
  return adapter.search(query);
}
