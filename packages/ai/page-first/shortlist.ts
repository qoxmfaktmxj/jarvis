/**
 * packages/ai/page-first/shortlist.ts
 *
 * Phase-W2 T2 — page-first navigation step 1/4.
 *
 * **LEGACY FALLBACK** — `catalog.ts` + `llm-shortlist.ts`가 기본 경로.
 * FEATURE_LLM_SHORTLIST=false 또는 LLM shortlist 실패 시 graceful fallback.
 *
 * Lexical shortlist against `wiki_page_index`. Intentionally NOT vector-based:
 * the page-first design (WIKI-AGENTS.md §7, .claude/commands/wiki-query.md)
 * trusts the human-authored page title, slug, and `frontmatter.aliases` as
 * the first-pass relevance signal. Vector search exists in the legacy path
 * (`retrieveRelevantClaims`) and is bypassed here on purpose.
 *
 * Scoring:
 *   - title ILIKE hit      — highest weight (x3)
 *   - aliases JSON match   — mid weight (x2, matches the array via `?|`)
 *   - slug ILIKE hit       — low weight (x1, slug is usually a normalized title)
 *   - path ILIKE hit       — low weight (x1, directory structure signal)
 *   - tags ILIKE hit       — low weight (x1, frontmatter tags signal)
 *   - freshness bonus      — `updatedAt` recency tiebreaker
 *
 * Permission filter:
 *   - Uses `buildWikiSensitivitySqlFilter` (Phase-W3 T5) — the strict
 *     wiki-sensitivity.ts `canViewSensitivity` contract: RESTRICTED requires
 *     KNOWLEDGE_REVIEW, SECRET_REF_ONLY requires SYSTEM_ACCESS_SECRET. This
 *     supersedes the legacy (looser) `buildKnowledgeSensitivitySqlFilter`
 *     that treated KNOWLEDGE_UPDATE as sufficient for RESTRICTED.
 *   - `requiredPermission` (wiki_page_index column, nullable) enforces
 *     page-level ACL: if set, the caller MUST carry that permission string.
 */

import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { buildWikiSensitivitySqlFragment } from "@jarvis/auth/rbac";
import { pgTextArray } from "../sql-utils.js";

export interface ShortlistHit {
  id: string;
  path: string;
  title: string;
  slug: string;
  sensitivity: string;
  requiredPermission: string | null;
  updatedAt: Date;
  score: number;
}

export interface ShortlistOptions {
  workspaceId: string;
  userPermissions: string[];
  /** Raw user question. We tokenize locally (no LLM) for lexical matching. */
  question: string;
  /** Defaults to 20 per the spec. */
  topK?: number;
  /**
   * Optional frontmatter `domain` filter. When set, only pages whose
   * `frontmatter.domain` equals this value are returned. Used by:
   *  - Ask AI routing that decides to scope answers to a single domain
   *    (e.g. "인프라 운영" 질문 → domain=infra)
   *  - Company Infra Dashboard listing only `domain=infra` pages
   *  - Any caller that already knows the target domain from context
   *
   * Undefined = no domain restriction (default, current behavior).
   */
  domain?: string;
}

/**
 * Extract a cheap set of lexical tokens for ILIKE / jsonb `?|` matching.
 * Korean + English split by any non-wordchar, drop stopwords and <2 char frags.
 */
function tokenize(question: string): string[] {
  const raw = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
  const stop = new Set([
    "the",
    "a",
    "an",
    "of",
    "to",
    "is",
    "what",
    "how",
    "and",
    "or",
    "뭐야",
    "어떻게",
    "이게",
    "어디",
    "누구",
  ]);
  return [...new Set(raw.filter((t) => t.length >= 2 && !stop.has(t)))];
}

export async function legacyLexicalShortlist(
  opts: ShortlistOptions,
): Promise<ShortlistHit[]> {
  const { workspaceId, userPermissions, question } = opts;
  const topK = opts.topK ?? 20;
  const tokens = tokenize(question);

  // No tokens → fall back to recency-only catalog (lets page-first still
  // return something when the user types e.g. "?" or whitespace; the
  // synthesis step will then refuse to answer.)
  const hasTokens = tokens.length > 0;

  const sensitivityClause = buildWikiSensitivitySqlFragment(userPermissions, {
    column: "wpi.sensitivity",
  });

  const permArray = pgTextArray(userPermissions);

  // Optional domain filter. Bound via parameter (not sql.raw) to avoid SQL
  // injection even though callers today only pass trusted constants.
  const domainClause = opts.domain
    ? sql` AND wpi.frontmatter ->> 'domain' = ${opts.domain}`
    : sql.empty();

  // Guard: no tokens → skip scoring SQL entirely, return recency-only results.
  if (!hasTokens) {
    const recentRows = await db.execute<{
      id: string;
      path: string;
      title: string;
      slug: string;
      sensitivity: string;
      required_permission: string | null;
      updated_at: Date;
    }>(sql`
      SELECT
        wpi.id, wpi.path, wpi.title, wpi.slug,
        wpi.sensitivity, wpi.required_permission, wpi.updated_at
      FROM wiki_page_index wpi
      WHERE wpi.workspace_id = ${workspaceId}::uuid
        AND wpi.published_status = 'published'
        AND wpi.stale = FALSE
        AND (
          wpi.required_permission IS NULL
          OR wpi.required_permission = ANY(${permArray})
          OR 'admin:all' = ANY(${permArray})
        )
        ${sensitivityClause}
        ${domainClause}
      ORDER BY wpi.updated_at DESC
      LIMIT ${topK}
    `);
    return recentRows.rows.map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title,
      slug: r.slug,
      sensitivity: r.sensitivity,
      requiredPermission: r.required_permission,
      updatedAt: r.updated_at,
      score: 0,
    }));
  }

  const tokenArray = pgTextArray(tokens);

  // Scoring weights: title=3, alias=2, slug=1, path=1, tags=1, +freshness.
  // extract(epoch) / 86400000 gives a monotonic updatedAt tiebreaker.
  // Overfetch topK*3 to compensate for requiredPermission filtering in SQL.
  const fetchLimit = topK * 3;
  const rows = await db.execute<{
    id: string;
    path: string;
    title: string;
    slug: string;
    sensitivity: string;
    required_permission: string | null;
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT
      wpi.id,
      wpi.path,
      wpi.title,
      wpi.slug,
      wpi.sensitivity,
      wpi.required_permission,
      wpi.updated_at,
      (
        (SELECT COUNT(*) FROM unnest(${tokenArray}) AS t
             WHERE wpi.title ILIKE '%' || t || '%') * 3
        + (SELECT COUNT(*) FROM unnest(${tokenArray}) AS t
             WHERE EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(wpi.frontmatter -> 'aliases') AS alias
               WHERE lower(alias) = lower(t)
             )) * 2
        + (SELECT COUNT(*) FROM unnest(${tokenArray}) AS t
             WHERE wpi.slug ILIKE '%' || t || '%') * 1
        + (SELECT COUNT(*) FROM unnest(${tokenArray}) AS t
             WHERE wpi.path ILIKE '%' || t || '%') * 1
        + (SELECT COUNT(*) FROM unnest(${tokenArray}) AS t
             WHERE (wpi.frontmatter->>'tags') ILIKE '%' || t || '%') * 1
        + (EXTRACT(EPOCH FROM wpi.updated_at) / 86400000.0)
      )::float8 AS score
    FROM wiki_page_index wpi
    WHERE wpi.workspace_id = ${workspaceId}::uuid
      AND wpi.published_status = 'published'
      AND wpi.stale = FALSE
      AND (
        wpi.required_permission IS NULL
        OR wpi.required_permission = ANY(${permArray})
        OR 'admin:all' = ANY(${permArray})
      )
      ${sensitivityClause}
      ${domainClause}
    ORDER BY score DESC, wpi.updated_at DESC
    LIMIT ${fetchLimit}
  `);

  // requiredPermission is now enforced in SQL WHERE. Map and trim to topK.
  return rows.rows
    .slice(0, topK)
    .map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title,
      slug: r.slug,
      sensitivity: r.sensitivity,
      requiredPermission: r.required_permission,
      updatedAt: r.updated_at,
      score: Number(r.score),
    }));
}
