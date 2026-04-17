// packages/search/precedent-search.ts
//
// Lane B — precedent_case (TF-IDF + SVD 1536d vector space).
//
// ⚠️ PHYSICAL ISOLATION INVARIANT ⚠️
// This adapter NEVER queries knowledge_page or UNIONs its results with
// PgSearchAdapter's output. The two vector spaces have the same dimensionality
// (1536) but different origins (OpenAI vs. TF-IDF+SVD); mixing them produces
// meaningless cosine similarity. See packages/search/README.md.
//
// The API route dispatches on `resourceType`: 'case' → this adapter,
// everything else → PgSearchAdapter.

import { buildLegacyKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type { SearchAdapter } from './adapter.js';
import type { SearchQuery, SearchResult, SearchHit } from './types.js';
import { assertValidEmbedding } from './pg-search.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PrecedentSearchAdapterOptions {
  embedQuery: (text: string) => Promise<number[]>;
}

export class PrecedentSearchAdapter implements SearchAdapter {
  private readonly embedQuery: (text: string) => Promise<number[]>;

  constructor(opts: PrecedentSearchAdapterOptions) {
    this.embedQuery = opts.embedQuery;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = ((query.page ?? 1) - 1) * limit;

    const qvec = await this.embedQuery(query.q);
    assertValidEmbedding(qvec);
    const literal = `[${qvec.join(',')}]`;

    // Apply the same sensitivity-based RBAC as Lane A — precedent_case rows
    // are tagged with `sensitivity` (default 'INTERNAL') and the filter must
    // exclude RESTRICTED / SECRET_REF_ONLY from users without clearance.
    const secretFilter = buildLegacyKnowledgeSensitivitySqlFilter(query.userPermissions);

    const rows = await db.execute<{
      id: string;
      title: string;
      cluster_label: string | null;
      sensitivity: string;
      updated_at: Date;
      vector_sim: number;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        cluster_label,
        sensitivity,
        updated_at,
        1 - (embedding <=> ${literal}::vector) AS vector_sim,
        COUNT(*) OVER ()::text                AS total_count
      FROM precedent_case
      WHERE workspace_id = ${query.workspaceId}::uuid
        AND embedding IS NOT NULL
        ${sql.raw(secretFilter)}
      ORDER BY embedding <=> ${literal}::vector
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
      trgmSim: 0,
      vectorSim: row.vector_sim,
      freshness: 0,
      hybridScore: row.vector_sim,
      url: `/cases/${row.id}`,
    }));

    return {
      hits,
      total,
      facets: { byPageType: {}, bySensitivity: {} },
      suggestions: [],
      query: query.q,
      durationMs: Date.now() - startMs,
    };
  }

  async suggest(): Promise<string[]> {
    // Lane B does not expose prefix suggestions — keep UX distinct from wiki.
    return [];
  }

  async indexPage(): Promise<void> {
    // no-op — precedent_case is populated by the TSVD999 cluster digest pipeline,
    // not by the wiki publish flow.
  }

  async deletePage(): Promise<void> {
    // no-op
  }
}
