/**
 * packages/ai/page-first/catalog.ts
 *
 * Phase-γ T7 — RBAC catalog pull (C 설계 Step 2).
 * DB는 권한 게이트키퍼. 탐색은 llm-shortlist.ts.
 * SELECT path/title/slug/aliases/tags/snippet/updated_at with workspace + sensitivity + permission + (optional) domain filter.
 */
import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { buildWikiSensitivitySqlFilter } from "@jarvis/auth/rbac";

export interface CatalogRow {
  path: string;
  title: string;
  slug: string;
  aliases: string[];
  tags: string[];
  snippet: string | null;
  updatedAt: Date;
}

export interface CatalogOptions {
  workspaceId: string;
  userPermissions: string[];
  domain?: string;
  limit?: number;
}

export async function getCatalog(opts: CatalogOptions): Promise<CatalogRow[]> {
  const limit = Math.min(opts.limit ?? 500, 1500);
  const sensitivityFilterStr = buildWikiSensitivitySqlFilter(opts.userPermissions);
  const sensitivityClause = sensitivityFilterStr
    ? sql.raw(` ${sensitivityFilterStr}`)
    : sql.empty();

  const result = await db.execute<{
    path: string;
    title: string;
    slug: string;
    aliases: unknown;
    tags: unknown;
    snippet: string | null;
    updated_at: Date;
  }>(sql`
    SELECT
      path,
      title,
      slug,
      COALESCE(frontmatter -> 'aliases', '[]'::jsonb) AS aliases,
      COALESCE(frontmatter -> 'tags', '[]'::jsonb) AS tags,
      snippet,
      updated_at
    FROM wiki_page_index
    WHERE workspace_id = ${opts.workspaceId}
      ${sensitivityClause}
      AND (
        required_permission IS NULL
        OR required_permission = ANY(${opts.userPermissions})
      )
      ${opts.domain ? sql`AND frontmatter->>'domain' = ${opts.domain}` : sql``}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    path: r.path,
    title: r.title,
    slug: r.slug,
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    snippet: r.snippet,
    updatedAt: r.updated_at,
  }));
}
