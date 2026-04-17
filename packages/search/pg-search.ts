// packages/search/pg-search.ts
import { buildLegacyKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { searchLog, popularSearch } from '@jarvis/db/schema';
import { featureSearchHybrid } from '@jarvis/db/feature-flags';
import { sql } from 'drizzle-orm';
import type { SearchAdapter } from './adapter.js';
import type { SearchQuery, SearchResult, SearchHit, ResourceType } from './types.js';
import { parseQuery, extractTerm } from './query-parser.js';
import { resolveSynonyms, buildExpandedQuery } from './synonym-resolver.js';
import { countFacets } from './facet-counter.js';
import { computeHybridScore, daysSince } from './hybrid-ranker.js';
import { HEADLINE_OPTIONS, sanitizeHeadline } from './highlighter.js';
import { buildExplain, canExplain } from './explain.js';
import { FallbackChain } from './fallback-chain.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reciprocal Rank Fusion: combine two ranked hit lists into one.
 *   score(doc) = Σ over lists of 1 / (k + rank_in_list).
 * k=60 is the classic RRF constant. The merged list is sorted by combined
 * score and truncated to `limit`. Exported for unit testing.
 */
export const RRF_K = 60;
export function mergeByRRF(a: SearchHit[], b: SearchHit[], limit: number): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  const visit = (list: SearchHit[]) => {
    list.forEach((hit, idx) => {
      const add = 1 / (RRF_K + idx + 1);
      const prev = scores.get(hit.id);
      if (prev) {
        prev.score += add;
        // Prefer the hit with richer fields (vectorSim present etc.)
        if ((hit.vectorSim ?? 0) > (prev.hit.vectorSim ?? 0)) prev.hit = hit;
      } else {
        scores.set(hit.id, { hit, score: add });
      }
    });
  };
  visit(a);
  visit(b);
  return Array.from(scores.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, hybridScore: score }));
}

/**
 * Phase-W5: reject non-finite values or wrong dimensionality before passing
 * the vector into SQL. Prevents silent Postgres parse errors and cheap DoS via
 * malformed embeddings.
 */
export function assertValidEmbedding(v: number[], expectedDim = 1536): void {
  if (!Array.isArray(v) || v.length !== expectedDim) {
    throw new Error(`[search] embedding must be length ${expectedDim}, got ${v?.length ?? 'n/a'}`);
  }
  for (const x of v) {
    if (!Number.isFinite(x)) {
      throw new Error('[search] embedding contains non-finite value (NaN/Infinity)');
    }
  }
}

export interface PgSearchAdapterOptions {
  /**
   * Phase-W5: pre-computes the query vector for Lane A hybrid search.
   * If omitted or the `FEATURE_SEARCH_HYBRID` flag is off, the vector lane
   * is skipped and `search()` falls back to FTS + trgm only.
   */
  embedQuery?: (text: string) => Promise<number[]>;
}

export class PgSearchAdapter implements SearchAdapter {
  private readonly fallbackChain: FallbackChain;
  private readonly embedQuery?: (text: string) => Promise<number[]>;

  constructor(opts: PgSearchAdapterOptions = {}) {
    this.fallbackChain = new FallbackChain(
      (q) => this.runFtsSearch(q),
      (q) => this.runTrgmSearch(q),
    );
    this.embedQuery = opts.embedQuery;
  }

  // -----------------------------------------------------------------------
  // Public: search
  // -----------------------------------------------------------------------

  async search(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = ((query.page ?? 1) - 1) * limit;

    // 1. Parse query to detect mode (phrase / web / prefix)
    const parsed = parseQuery(query.q);
    const term = extractTerm(query.q);

    // 2. Resolve synonyms and expand query if needed
    const synonymTerms = await resolveSynonyms(term, query.workspaceId);
    const expandedTerm = synonymTerms.length > 1 ? buildExpandedQuery(synonymTerms) : term;

    // 3. Build enriched query with expanded term
    const enrichedQuery: SearchQuery = { ...query, q: expandedTerm };

    // 4. Run main FTS search; if empty trigger fallback chain
    const ftsResult = await this.runFtsSearch(enrichedQuery, { limit, offset, parsed });

    // 4b. Phase-W5: when FEATURE_SEARCH_HYBRID is on and embedQuery is wired,
    //     also run the vector lane and RRF-merge the two ranked lists.
    let vectorResult: SearchResult | null = null;
    if (featureSearchHybrid() && this.embedQuery) {
      try {
        const qvec = await this.embedQuery(term);
        vectorResult = await this.runVectorSearch(enrichedQuery, qvec, { limit, offset });
      } catch (err) {
        // Vector failures must not break search — degrade to FTS-only.
        console.warn('[search] vector lane failed, falling back to FTS only:', err);
        vectorResult = null;
      }
    }

    let result: SearchResult;
    if (vectorResult && (ftsResult.hits.length > 0 || vectorResult.hits.length > 0)) {
      const merged = mergeByRRF(ftsResult.hits, vectorResult.hits, limit);
      // Total: use the larger of the two underlying totals so pagination
      // does not under-report the population. Union cardinality is unknowable
      // without a cross-lane COUNT DISTINCT, so the larger is a safe lower
      // bound on "how many results could the user browse to."
      result = {
        hits: merged,
        total: Math.max(ftsResult.total, vectorResult.total),
        facets: { byPageType: {}, bySensitivity: {} },
        suggestions: [],
        query: enrichedQuery.q,
        durationMs: Date.now() - startMs,
      };
    } else if (ftsResult.hits.length > 0) {
      result = ftsResult;
    } else {
      result = await this.fallbackChain.run(enrichedQuery);
    }

    // 5. Run facets in parallel (use original query for facet counts)
    const facets = await countFacets(query.workspaceId, parsed.tsquery, query.userPermissions).catch(() => ({
      byPageType: {},
      bySensitivity: {},
    }));

    // 6. Attach explain for admin users
    const explain = canExplain(query.userRoles)
      ? buildExplain(result.hits)
      : undefined;

    // 7. Log search to analytics
    const durationMs = Date.now() - startMs;
    await this.logSearch(query, result.hits.length, durationMs).catch(() => {});

    return {
      ...result,
      facets,
      durationMs,
      explain,
    };
  }

  // -----------------------------------------------------------------------
  // Public: suggest (autocomplete)
  // -----------------------------------------------------------------------

  async suggest(prefix: string, workspaceId: string, userPermissions: string[] = []): Promise<string[]> {
    if (!prefix || prefix.trim().length < 2) return [];

    const sanitizedPrefix = prefix.trim().replace(/[^\w\s]/g, '').substring(0, 100);
    // Escape LIKE wildcards (_ is a word char, so it passes the regex above)
    const escapedPrefix = sanitizedPrefix.replace(/[%_\\]/g, '\\$&');
    const sensitivityFilter = this.buildSecretFilter(userPermissions);

    const [titleRows, popularRows] = await Promise.all([
      // Match page titles with prefix — apply same sensitivity filter as main search
      db.execute<{ title: string }>(sql`
        SELECT DISTINCT title
        FROM knowledge_page
        WHERE
          workspace_id = ${workspaceId}::uuid
          AND publish_status != 'deleted'
          AND title ILIKE ${escapedPrefix + '%'}
          ${sql.raw(sensitivityFilter)}
        ORDER BY title
        LIMIT 6
      `),
      // Match popular search terms
      db.execute<{ query: string }>(sql`
        SELECT DISTINCT query
        FROM popular_search
        WHERE
          workspace_id = ${workspaceId}::uuid
          AND query ILIKE ${sanitizedPrefix + '%'}
        ORDER BY count DESC
        LIMIT 4
      `),
    ]);

    const suggestions = new Set<string>();
    for (const row of titleRows.rows) suggestions.add(row.title);
    for (const row of popularRows.rows) suggestions.add(row.query);

    return Array.from(suggestions).slice(0, 8);
  }

  // -----------------------------------------------------------------------
  // Public: indexPage — rebuild search_vector for a single page
  // -----------------------------------------------------------------------

  async indexPage(pageId: string): Promise<void> {
    await db.execute(sql`
      UPDATE knowledge_page
      SET search_vector =
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B')
      WHERE id = ${pageId}::uuid
    `);
  }

  // -----------------------------------------------------------------------
  // Public: deletePage — clear search_vector for a deleted page
  // -----------------------------------------------------------------------

  async deletePage(pageId: string): Promise<void> {
    await db.execute(sql`
      UPDATE knowledge_page
      SET search_vector = to_tsvector('simple', '')
      WHERE id = ${pageId}::uuid
    `);
  }

  // -----------------------------------------------------------------------
  // Private: runFtsSearch
  // -----------------------------------------------------------------------

  async runFtsSearch(
    query: SearchQuery,
    opts?: { limit?: number; offset?: number; parsed?: ReturnType<typeof parseQuery> },
  ): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const offset = opts?.offset ?? 0;
    const parsed = opts?.parsed ?? parseQuery(query.q);
    const term = extractTerm(query.q);

    // Build optional permission filter clause
    const secretFilter = this.buildSecretFilter(query.userPermissions);

    // Build optional page type / sensitivity / date range filters
    const extraFilters = this.buildExtraFilters(query);

    const rows = await db.execute<{
      id: string;
      title: string;
      page_type: string;
      sensitivity: string;
      updated_at: Date;
      fts_rank: number;
      trgm_sim: number;
      hybrid_score: number;
      headline: string;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        page_type,
        sensitivity,
        updated_at,
        ts_rank_cd(search_vector, ${sql.raw(parsed.tsquery)}, 4)   AS fts_rank,
        similarity(title, ${term})                                   AS trgm_sim,
        (
          ts_rank_cd(search_vector, ${sql.raw(parsed.tsquery)}, 4) * 0.6 +
          similarity(title, ${term}) * 0.3 +
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END * 0.1
        )                                                            AS hybrid_score,
        ts_headline(
          'simple',
          coalesce(summary, ''),
          ${sql.raw(parsed.tsquery)},
          ${HEADLINE_OPTIONS}
        )                                                            AS headline,
        COUNT(*) OVER ()::text                                       AS total_count
      FROM knowledge_page
      WHERE
        workspace_id = ${query.workspaceId}::uuid
        AND publish_status != 'deleted'
        AND search_vector @@ ${sql.raw(parsed.tsquery)}
        ${sql.raw(secretFilter)}
        ${sql.raw(extraFilters)}
      ORDER BY ${sql.raw(this.buildOrderBy(query.sortBy ?? 'relevance'))}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const firstRow = rows.rows[0];
    const total = firstRow ? parseInt(firstRow.total_count, 10) : 0;
    const hits = rows.rows.map((row) => this.mapRowToHit(row, term));

    return {
      hits,
      total,
      facets: { byPageType: {}, bySensitivity: {} },
      suggestions: [],
      query: query.q,
      durationMs: Date.now() - startMs,
    };
  }

  // -----------------------------------------------------------------------
  // Private: runTrgmSearch — similarity fallback when FTS returns nothing
  // -----------------------------------------------------------------------

  async runTrgmSearch(
    query: SearchQuery,
    opts?: { limit?: number; offset?: number },
  ): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const offset = opts?.offset ?? 0;
    const term = extractTerm(query.q);

    const secretFilter = this.buildSecretFilter(query.userPermissions);
    const extraFilters = this.buildExtraFilters(query);

    const rows = await db.execute<{
      id: string;
      title: string;
      page_type: string;
      sensitivity: string;
      updated_at: Date;
      trgm_sim: number;
      headline: string;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        page_type,
        sensitivity,
        updated_at,
        similarity(title, ${term})          AS trgm_sim,
        left(coalesce(summary, ''), 300)     AS headline,
        COUNT(*) OVER ()::text              AS total_count
      FROM knowledge_page
      WHERE
        workspace_id = ${query.workspaceId}::uuid
        AND publish_status != 'deleted'
        AND similarity(title, ${term}) > 0.3
        ${sql.raw(secretFilter)}
        ${sql.raw(extraFilters)}
      ORDER BY trgm_sim DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const firstTrgmRow = rows.rows[0];
    const total = firstTrgmRow ? parseInt(firstTrgmRow.total_count, 10) : 0;
    const hits = rows.rows.map((row) => ({
      id: row.id,
      resourceType: 'knowledge' as ResourceType,
      title: row.title,
      headline: sanitizeHeadline(row.headline ?? ''),
      pageType: row.page_type,
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: 0,
      trgmSim: row.trgm_sim,
      freshness: this.computeFreshness(row.updated_at),
      hybridScore: computeHybridScore(0, row.trgm_sim, daysSince(row.updated_at)),
      url: `/knowledge/${row.id}`,
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

  // -----------------------------------------------------------------------
  // Public: runVectorSearch — HNSW cosine-distance search against
  // knowledge_page.embedding (Lane A; OpenAI text-embedding-3-small space).
  // Callers supply the pre-computed query vector. This method never reads
  // Lane B (precedent_case) — isolated per packages/search/README.md.
  // -----------------------------------------------------------------------

  async runVectorSearch(
    query: SearchQuery,
    queryVector: number[],
    opts?: { limit?: number; offset?: number },
  ): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const offset = opts?.offset ?? 0;

    assertValidEmbedding(queryVector);

    const secretFilter = this.buildSecretFilter(query.userPermissions);
    const extraFilters = this.buildExtraFilters(query);
    const literal = `[${queryVector.join(',')}]`;

    const rows = await db.execute<{
      id: string;
      title: string;
      page_type: string;
      sensitivity: string;
      updated_at: Date;
      vector_sim: number;
      headline: string;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        page_type,
        sensitivity,
        updated_at,
        1 - (embedding <=> ${literal}::vector)        AS vector_sim,
        left(coalesce(summary, ''), 300)              AS headline,
        COUNT(*) OVER ()::text                        AS total_count
      FROM knowledge_page
      WHERE
        workspace_id = ${query.workspaceId}::uuid
        AND publish_status != 'deleted'
        AND embedding IS NOT NULL
        ${sql.raw(secretFilter)}
        ${sql.raw(extraFilters)}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit} OFFSET ${offset}
    `);

    const first = rows.rows[0];
    const total = first ? parseInt(first.total_count, 10) : 0;
    const hits: SearchHit[] = rows.rows.map((row) => ({
      id: row.id,
      resourceType: 'knowledge' as ResourceType,
      title: row.title,
      headline: sanitizeHeadline(row.headline ?? ''),
      pageType: row.page_type,
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: 0,
      trgmSim: 0,
      vectorSim: row.vector_sim,
      freshness: this.computeFreshness(row.updated_at),
      hybridScore: row.vector_sim,
      url: `/knowledge/${row.id}`,
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

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private mapRowToHit(
    row: {
      id: string;
      title: string;
      page_type: string;
      sensitivity: string;
      updated_at: Date;
      fts_rank: number;
      trgm_sim: number;
      hybrid_score: number;
      headline: string;
    },
    _term: string,
  ): SearchHit {
    const freshness = this.computeFreshness(row.updated_at);
    return {
      id: row.id,
      resourceType: 'knowledge',
      title: row.title,
      headline: sanitizeHeadline(row.headline ?? ''),
      pageType: row.page_type,
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: row.fts_rank,
      trgmSim: row.trgm_sim,
      freshness,
      // Use the DB-computed score so hybridScore matches the actual sort order
      hybridScore: row.hybrid_score,
      url: `/knowledge/${row.id}`,
    };
  }

  private computeFreshness(updatedAt: Date): number {
    const days = daysSince(updatedAt);
    if (days < 7) return 1.0;
    if (days < 30) return 0.8;
    if (days < 90) return 0.5;
    return 0.2;
  }

  /**
   * Returns SQL WHERE fragment to exclude pages the user cannot access,
   * based on session.permissions (mirrors legacyCanAccessSensitivity in packages/auth/rbac.ts).
   *
   * - SYSTEM_ACCESS_SECRET or ADMIN_ALL → no filter (can see everything)
   * - SYSTEM_READ only                  → exclude SECRET_REF_ONLY
   * - no elevated permission            → exclude RESTRICTED + SECRET_REF_ONLY
   */
  private buildSecretFilter(userPermissions: string[]): string {
    return buildLegacyKnowledgeSensitivitySqlFilter(userPermissions);
  }

  /**
   * Build SQL WHERE fragments for optional filters: pageType, sensitivity, dateRange.
   * All user-supplied values are validated/whitelisted before interpolation to prevent SQL injection.
   */
  private buildExtraFilters(query: SearchQuery): string {
    const parts: string[] = [];

    // Whitelist known page types — reject anything not in the list
    const VALID_PAGE_TYPES = new Set([
      'project', 'system', 'access', 'runbook', 'onboarding',
      'hr-policy', 'tool-guide', 'faq', 'decision', 'incident', 'analysis', 'glossary',
    ]);
    if (query.pageType && VALID_PAGE_TYPES.has(query.pageType)) {
      parts.push(`AND page_type = '${query.pageType}'`);
    }

    // Whitelist known sensitivity values
    const VALID_SENSITIVITIES = new Set(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY']);
    if (query.sensitivity && VALID_SENSITIVITIES.has(query.sensitivity)) {
      parts.push(`AND sensitivity = '${query.sensitivity}'`);
    }

    // Strict ISO date validation — only allow YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ patterns
    // This regex allows no SQL special characters
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/;
    if (query.dateFrom && ISO_DATE_RE.test(query.dateFrom)) {
      parts.push(`AND updated_at >= '${query.dateFrom}'::timestamptz`);
    }
    if (query.dateTo && ISO_DATE_RE.test(query.dateTo)) {
      parts.push(`AND updated_at <= '${query.dateTo}'::timestamptz`);
    }

    return parts.join(' ');
  }

  /**
   * Build ORDER BY clause based on sortBy selection.
   */
  private buildOrderBy(sortBy: string): string {
    switch (sortBy) {
      case 'date':     // legacy alias
      case 'newest':
        return 'updated_at DESC';
      case 'freshness':
        // Tie-breaker: updated_at DESC ensures stable pagination within each bucket
        return `
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END DESC,
          updated_at DESC
        `;
      case 'relevance':
        return 'fts_rank DESC, trgm_sim DESC';
      case 'popularity': // legacy alias
      case 'hybrid':
      default:
        // hybrid_score is computed in the SELECT as the weighted formula
        // (fts*0.6 + trgm*0.3 + freshness*0.1). Referencing a standalone alias
        // in ORDER BY is valid PostgreSQL — only alias arithmetic is disallowed.
        return 'hybrid_score DESC';
    }
  }

  private async logSearch(
    query: SearchQuery,
    resultCount: number,
    durationMs: number,
  ): Promise<void> {
    await db.insert(searchLog).values({
      workspaceId: query.workspaceId,
      userId: query.userId,
      query: query.q,
      resultCount,
      responseMs: durationMs,
    });

    // Upsert popular search counter — use current date as period
    await db.execute(sql`
      INSERT INTO popular_search (workspace_id, query, count, period)
      VALUES (
        ${query.workspaceId}::uuid,
        ${query.q},
        1,
        date_trunc('week', now())::date
      )
      ON CONFLICT (workspace_id, query, period)
      DO UPDATE SET
        count = popular_search.count + 1
    `);
  }
}
