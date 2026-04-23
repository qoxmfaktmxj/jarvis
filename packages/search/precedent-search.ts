// packages/search/precedent-search.ts
//
// Lane B — precedent_case search.
//
// Phase-Harness (2026-04-23): 벡터 검색(TF-IDF + SVD 1536d) 전면 제거.
// `precedent_case.embedding` 컬럼이 migration 0037 로 드롭되었기 때문에
// 이 adapter 는 BM25 / ILIKE 기반 키워드 검색만 수행한다. 향후 ask-agent
// 의 wiki-grep 동급 도구로 흡수되거나 별도 case-grep tool 로 분리될 수
// 있음 (Phase G 이후 과제).
//
// 격리 원칙은 유지: 이 adapter 는 절대 knowledge_page 를 조회하지 않는다.

import { buildLegacyKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type { SearchAdapter } from './adapter.js';
import type { SearchQuery, SearchResult, SearchHit } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Escape LIKE/ILIKE 메타문자(`%`, `_`, `\`) — 사용자 입력을 리터럴 매칭으로
 * 만들어 `%abc` 같은 쿼리가 전체 행을 긁어가지 않게 한다. drizzle `sql`
 * template literal 은 parameter binding 을 해주지만 `%${q}%` 안의 `%` 는
 * 여전히 ILIKE 와일드카드로 해석되므로 문자열 조립 전에 escape 가 필요하다.
 */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export interface PrecedentSearchAdapterOptions {
  // Phase-Harness 이후 옵션 없음. 하위 호환을 위해 빈 shape 유지.
}

export class PrecedentSearchAdapter implements SearchAdapter {
  constructor(_opts: PrecedentSearchAdapterOptions = {}) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = ((query.page ?? 1) - 1) * limit;

    // Apply same sensitivity-based RBAC as Lane A.
    const secretFilter = buildLegacyKnowledgeSensitivitySqlFilter(query.userPermissions);

    // BM25-like 근사: title + symptom + cluster_label 에 pg_trgm similarity 사용.
    // precedent_case 는 search_vector 컬럼이 없어 FTS 대신 trigram 유사도로 대체.
    //
    // 인덱스: migration 0039 가 title/symptom/cluster_label 에 GIN
    // (gin_trgm_ops) 인덱스를 만들어 둠. 따라서 similarity() / ILIKE 모두
    // 인덱스로 가속된다.
    const q = query.q.trim();
    if (q.length === 0) {
      return {
        hits: [],
        total: 0,
        facets: { byPageType: {}, bySensitivity: {} },
        suggestions: [],
        query: q,
        durationMs: Date.now() - startMs,
      };
    }

    // ILIKE 매칭에는 메타문자 escape 된 패턴을 사용 (P2 fix).
    // similarity() 함수는 와일드카드 의미가 없으므로 원본 q 를 그대로 사용.
    const likePattern = `%${escapeLike(q)}%`;

    const rows = await db.execute<{
      id: string;
      title: string;
      cluster_label: string | null;
      sensitivity: string;
      updated_at: Date;
      trgm_sim: number;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        cluster_label,
        sensitivity,
        updated_at,
        GREATEST(
          similarity(title, ${q}),
          similarity(coalesce(symptom, ''), ${q}),
          similarity(coalesce(cluster_label, ''), ${q})
        ) AS trgm_sim,
        COUNT(*) OVER ()::text AS total_count
      FROM precedent_case
      WHERE workspace_id = ${query.workspaceId}::uuid
        AND (
          title ILIKE ${likePattern}
          OR symptom ILIKE ${likePattern}
          OR cluster_label ILIKE ${likePattern}
        )
        ${sql.raw(secretFilter)}
      ORDER BY trgm_sim DESC, updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const first = rows.rows[0];
    const total = first ? parseInt(first.total_count, 10) : 0;
    const hits: SearchHit[] = rows.rows.map((row) => ({
      id: row.id,
      resourceType: 'case',
      title: row.title,
      headline: row.cluster_label ?? '',
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: 0,
      trgmSim: Number(row.trgm_sim),
      freshness: 0,
      hybridScore: Number(row.trgm_sim),
      url: `/cases/${row.id}`,
    }));

    return {
      hits,
      total,
      facets: { byPageType: {}, bySensitivity: {} },
      suggestions: [],
      query: q,
      durationMs: Date.now() - startMs,
    };
  }

  async suggest(): Promise<string[]> {
    return [];
  }

  async indexPage(): Promise<void> {
    // no-op
  }

  async deletePage(): Promise<void> {
    // no-op
  }
}
