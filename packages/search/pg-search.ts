// packages/search/pg-search.ts
//
// Phase-Harness (2026-04-23): 벡터 검색(Lane A hybrid) 전면 폐지.
// knowledge_page.embedding 컬럼이 migration 0037 로 드롭되어 벡터 경로는
// 더 이상 존재하지 않는다. FTS(tsvector) + pg_trgm fallback 만 남는다.
// 기존 `mergeByRRF`, `assertValidEmbedding`, `runVectorSearch`, `embedQuery`
// 옵션 등은 전부 제거.
import { buildLegacyKnowledgeSensitivitySqlFragment } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { searchLog, popularSearch } from '@jarvis/db/schema';
import { sql, type SQL } from 'drizzle-orm';
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

export interface PgSearchAdapterOptions {
  // Phase-Harness (2026-04-23): embedQuery 옵션 제거. 벡터 경로 자체가 없다.
  // 인터페이스는 빈 shape 로 유지해 하위 호환성(빈 객체 전달) 만 지원.
}

export class PgSearchAdapter implements SearchAdapter {
  private readonly fallbackChain: FallbackChain;

  constructor(_opts: PgSearchAdapterOptions = {}) {
    this.fallbackChain = new FallbackChain(
      (q) => this.runFtsSearch(q),
      (q) => this.runTrgmSearch(q),
    );
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

    // 4. Run main FTS search; if empty trigger fallback chain.
    // Phase-Harness (2026-04-23): 벡터 lane 제거. FTS + trgm fallback 만.
    const ftsResult = await this.runFtsSearch(enrichedQuery, { limit, offset, parsed });

    let result: SearchResult;
    if (ftsResult.hits.length > 0) {
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
    const sensitivityFragment = this.buildSecretFilter(userPermissions);

    const [titleRows, popularRows] = await Promise.all([
      // Match page titles with prefix — apply same sensitivity filter as main search
      db.execute<{ title: string }>(sql`
        SELECT DISTINCT title
        FROM knowledge_page
        WHERE
          workspace_id = ${workspaceId}::uuid
          AND publish_status != 'deleted'
          AND title ILIKE ${escapedPrefix + '%'}
          ${sensitivityFragment}
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

    // Build optional permission filter clause (returns Drizzle SQL fragment)
    const secretFragment = this.buildSecretFilter(query.userPermissions);

    // Build optional page type / sensitivity / date range filters (returns Drizzle SQL fragment)
    const extraFragment = this.buildExtraFilters(query);

    // tsquery is a safe PG function call string (escaped by query-parser.ts).
    // sql.raw() is permitted here because parsed.tsquery is a closed static PG
    // function call with apostrophes doubled — no user string escapes the call.
    const tsquerySql = sql.raw(parsed.tsquery);

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
        ts_rank_cd(search_vector, ${tsquerySql}, 4)   AS fts_rank,
        similarity(title, ${term})                     AS trgm_sim,
        (
          ts_rank_cd(search_vector, ${tsquerySql}, 4) * 0.6 +
          similarity(title, ${term}) * 0.3 +
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END * 0.1
        )                                              AS hybrid_score,
        ts_headline(
          'simple',
          coalesce(summary, ''),
          ${tsquerySql},
          ${HEADLINE_OPTIONS}
        )                                              AS headline,
        COUNT(*) OVER ()::text                         AS total_count
      FROM knowledge_page
      WHERE
        workspace_id = ${query.workspaceId}::uuid
        AND publish_status != 'deleted'
        AND search_vector @@ ${tsquerySql}
        ${secretFragment}
        ${extraFragment}
      ORDER BY ${this.buildOrderBy(query.sortBy ?? 'relevance')}
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

    const secretFragment = this.buildSecretFilter(query.userPermissions);
    const extraFragment = this.buildExtraFilters(query);

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
        ${secretFragment}
        ${extraFragment}
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
   * Returns Drizzle SQL fragment to exclude pages the user cannot access,
   * based on session.permissions (mirrors legacyCanAccessSensitivity in packages/auth/rbac.ts).
   *
   * - SYSTEM_ACCESS_SECRET or ADMIN_ALL → empty fragment (can see everything)
   * - SYSTEM_READ only                  → exclude SECRET_REF_ONLY
   * - no elevated permission            → AND 1 = 0
   */
  private buildSecretFilter(userPermissions: string[]): SQL {
    return buildLegacyKnowledgeSensitivitySqlFragment(userPermissions);
  }

  /**
   * Build Drizzle SQL fragments for optional filters: pageType, sensitivity, dateRange.
   * All user-supplied values are validated/whitelisted before binding to prevent SQL injection.
   * - pageType / sensitivity: only whitelisted enum values are accepted; unknown values are dropped.
   * - dates: parameter-bound via Drizzle (no sql.raw); must match strict ISO_DATE_RE.
   */
  private buildExtraFilters(query: SearchQuery): SQL {
    const parts: SQL[] = [];

    // Whitelist known page types — reject anything not in the list
    const VALID_PAGE_TYPES = new Set([
      'project', 'system', 'access', 'runbook', 'onboarding',
      'hr-policy', 'tool-guide', 'faq', 'decision', 'incident', 'analysis', 'glossary',
    ]);
    if (query.pageType && VALID_PAGE_TYPES.has(query.pageType)) {
      // pageType is a whitelisted enum — safe to bind as a parameter
      parts.push(sql` AND page_type = ${query.pageType}`);
    }

    // Whitelist known sensitivity values
    const VALID_SENSITIVITIES = new Set(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY']);
    if (query.sensitivity && VALID_SENSITIVITIES.has(query.sensitivity)) {
      // sensitivity is a whitelisted enum — safe to bind as a parameter
      parts.push(sql` AND sensitivity = ${query.sensitivity}`);
    }

    // Strict ISO date validation — only allow YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ patterns
    // Values are parameter-bound by Drizzle (no sql.raw) even after validation
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/;
    if (query.dateFrom && ISO_DATE_RE.test(query.dateFrom)) {
      parts.push(sql` AND updated_at >= ${query.dateFrom}::timestamptz`);
    }
    if (query.dateTo && ISO_DATE_RE.test(query.dateTo)) {
      parts.push(sql` AND updated_at <= ${query.dateTo}::timestamptz`);
    }

    return parts.length === 0 ? sql`` : sql.join(parts, sql.raw(''));
  }

  /**
   * Build ORDER BY clause based on sortBy selection.
   * Returns a static Drizzle SQL literal from a closed switch — no user input reaches raw SQL.
   */
  private buildOrderBy(sortBy: string): SQL {
    switch (sortBy) {
      case 'date':     // legacy alias
      case 'newest':
        return sql.raw('updated_at DESC');
      case 'freshness':
        // Tie-breaker: updated_at DESC ensures stable pagination within each bucket
        return sql.raw(`
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END DESC,
          updated_at DESC
        `);
      case 'relevance':
        return sql.raw('fts_rank DESC, trgm_sim DESC');
      case 'popularity': // legacy alias
      case 'hybrid':
      default:
        // hybrid_score is computed in the SELECT as the weighted formula
        // (fts*0.6 + trgm*0.3 + freshness*0.1). Referencing a standalone alias
        // in ORDER BY is valid PostgreSQL — only alias arithmetic is disallowed.
        return sql.raw('hybrid_score DESC');
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
