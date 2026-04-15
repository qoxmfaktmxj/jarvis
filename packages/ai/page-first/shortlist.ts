/**
 * packages/ai/page-first/shortlist.ts
 *
 * Phase-W2 T2 — page-first navigation step 1/4.
 *
 * Lexical shortlist against `wiki_page_index`. Intentionally NOT vector-based:
 * the page-first design (WIKI-AGENTS.md §7, .claude/commands/wiki-query.md)
 * trusts the human-authored page title, slug, and `frontmatter.aliases` as
 * the first-pass relevance signal. Vector search exists in the legacy path
 * (`retrieveRelevantClaims` / `retrieveChunkHybrid`) and is bypassed here on
 * purpose.
 *
 * Scoring:
 *   - title ILIKE hit      — highest weight
 *   - aliases JSON match   — mid weight (matches the array via `?|`)
 *   - slug ILIKE hit       — low weight (slug is usually a normalized title)
 *   - freshness bonus      — `updatedAt` recency tiebreaker
 *
 * Permission filter:
 *   - Uses `buildKnowledgeSensitivitySqlFilter` (re-targeted at
 *     `wpi.sensitivity`) to reuse the same RESTRICTED / SECRET_REF_ONLY
 *     gate as knowledge_page. This is the "RBAC + sensitivity both apply"
 *     rule from CLAUDE.md.
 *   - `requiredPermission` (wiki_page_index column, nullable) enforces
 *     page-level ACL: if set, the caller MUST carry that permission string.
 */

import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { buildKnowledgeSensitivitySqlFilter } from "@jarvis/auth/rbac";

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

export async function lexicalShortlist(
  opts: ShortlistOptions,
): Promise<ShortlistHit[]> {
  const { workspaceId, userPermissions, question } = opts;
  const topK = opts.topK ?? 20;
  const tokens = tokenize(question);

  // No tokens → fall back to recency-only catalog (lets page-first still
  // return something when the user types e.g. "?" or whitespace; the
  // synthesis step will then refuse to answer.)
  const hasTokens = tokens.length > 0;

  const sensitivityFilter = buildKnowledgeSensitivitySqlFilter(userPermissions)
    .replace(/\bsensitivity\b/g, "wpi.sensitivity")
    .trim();
  const sensitivityClause = sensitivityFilter
    ? sql.raw(` ${sensitivityFilter}`)
    : sql.empty();

  // ILIKE pattern pieces — we build an OR over every token for title/slug,
  // and pass the token array to jsonb `?|` for aliases matching.
  // `%tok%` is safe because tokens are already tokenize()-filtered (no %/_).
  const ilikeAny = hasTokens
    ? sql.join(
        tokens.map(
          (tok) =>
            sql`(wpi.title ILIKE ${`%${tok}%`} OR wpi.slug ILIKE ${`%${tok}%`})`,
        ),
        sql` OR `,
      )
    : sql`TRUE`;

  const tokenArray = tokens; // drizzle serializes string[] → text[] for us.

  // Scoring weights kept inline: title=3, alias=2, slug=1, +freshness.
  // extract(epoch) / 86400 gives a monotonic updatedAt tiebreaker.
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
        (CASE WHEN ${hasTokens ? sql`(${ilikeAny})` : sql`FALSE`} THEN 0 ELSE 0 END)
        + (SELECT COUNT(*) FROM unnest(${tokenArray}::text[]) AS t
             WHERE wpi.title ILIKE '%' || t || '%') * 3
        + (CASE WHEN ${tokenArray}::text[] <> '{}'::text[]
             AND (wpi.frontmatter -> 'aliases') ?| ${tokenArray}::text[] THEN 2 ELSE 0 END)
        + (SELECT COUNT(*) FROM unnest(${tokenArray}::text[]) AS t
             WHERE wpi.slug ILIKE '%' || t || '%') * 1
        + (EXTRACT(EPOCH FROM wpi.updated_at) / 86400000.0)
      )::float8 AS score
    FROM wiki_page_index wpi
    WHERE wpi.workspace_id = ${workspaceId}::uuid
      AND wpi.published_status = 'published'
      AND wpi.stale = FALSE
      ${sensitivityClause}
    ORDER BY score DESC, wpi.updated_at DESC
    LIMIT ${topK}
  `);

  // requiredPermission는 DB 필터로 표현하기 번거롭다 (NULL-친화 + 권한 배열).
  // 앱 레이어에서 한 번 더 걸러낸다.
  const permSet = new Set(userPermissions);
  return rows.rows
    .filter(
      (r) =>
        !r.required_permission ||
        permSet.has(r.required_permission) ||
        permSet.has("admin:all"),
    )
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
