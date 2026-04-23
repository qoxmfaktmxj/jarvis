// apps/web/lib/queries/precedent-search.ts
// Phase-W5: server-side Lane B executor mirroring lib/queries/search.ts.
// Phase-Harness (2026-04-23): embed 경로 제거. precedent_case.embedding 컬럼이
// migration 0037 로 드롭되었기 때문에 adapter 내부의 벡터 경로는 실패한다.
// embedQuery 는 required 시그니처라 no-op 을 전달하고, Phase F 에서
// PrecedentSearchAdapter 를 BM25/trigram 전용으로 재작성하며 시그니처 정리.
import { PrecedentSearchAdapter } from '@jarvis/search/precedent-search';
import type { SearchQuery, SearchResult } from '@jarvis/search/types';

const noopEmbed = async (_text: string): Promise<number[]> => [];
const adapter = new PrecedentSearchAdapter({ embedQuery: noopEmbed });

/**
 * Executes Lane B (precedent_case) search directly via adapter.
 * Used by `/search?resourceType=case` server route to avoid HTTP round-trip.
 */
export async function executePrecedentSearch(query: SearchQuery): Promise<SearchResult> {
  return adapter.search(query);
}
