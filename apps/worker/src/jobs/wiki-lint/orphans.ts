/**
 * apps/worker/src/jobs/wiki-lint/orphans.ts
 *
 * Phase-W2 T3 — orphan detection (WIKI-AGENTS.md §3.3).
 *
 * An "orphan" is a wiki page with zero inbound `[[wikilink]]` references.
 * `index.md`, `log.md`, and anything under `_system/**` are hub pages and
 * never counted as orphans. We also ignore pages whose `type` is not one
 * of the content types (entity/concept/synthesis/source/derived) — catch
 * for any future "draft" / "stub" types that should not emit review items.
 *
 * Pure SQL / in-memory set diff. No LLM call.
 */

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { and, eq, sql } from "drizzle-orm";

export interface OrphanPage {
  pageId: string;
  path: string;
  title: string;
  slug: string;
  type: string;
  updatedAt: Date;
}

const CONTENT_TYPES = new Set([
  "entity",
  "concept",
  "synthesis",
  "source",
  "derived",
]);

/**
 * Return pages in `workspaceId` that have zero inbound links. Excludes
 * `_system/**`, `index.md`, `log.md`, and non-content types.
 */
export async function detectOrphans(
  workspaceId: string,
): Promise<OrphanPage[]> {
  // LEFT JOIN on inbound links per page, filter count=0.
  // We join wiki_page_link as the "inbound" side via to_page_id.
  const rows = await db
    .select({
      pageId: wikiPageIndex.id,
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      type: wikiPageIndex.type,
      updatedAt: wikiPageIndex.updatedAt,
      inboundCount: sql<number>`COUNT(${wikiPageLink.id})::int`,
    })
    .from(wikiPageIndex)
    .leftJoin(
      wikiPageLink,
      and(
        eq(wikiPageLink.toPageId, wikiPageIndex.id),
        eq(wikiPageLink.workspaceId, workspaceId),
      ),
    )
    .where(eq(wikiPageIndex.workspaceId, workspaceId))
    .groupBy(
      wikiPageIndex.id,
      wikiPageIndex.path,
      wikiPageIndex.title,
      wikiPageIndex.slug,
      wikiPageIndex.type,
      wikiPageIndex.updatedAt,
    );

  return rows
    .filter((r) => Number(r.inboundCount) === 0)
    .filter((r) => CONTENT_TYPES.has(r.type))
    .filter((r) => !isHubPath(r.path))
    .map((r) => ({
      pageId: r.pageId,
      path: r.path,
      title: r.title,
      slug: r.slug,
      type: r.type,
      updatedAt: r.updatedAt,
    }));
}

/**
 * Hub pages never count as orphans. Kept as a pure predicate so tests can
 * pass arbitrary paths.
 */
export function isHubPath(repoRelativePath: string): boolean {
  // paths are workspace-relative like `wiki/{ws}/auto/concepts/foo.md`.
  const normalized = repoRelativePath.replace(/\\/g, "/");
  if (normalized.endsWith("/index.md")) return true;
  if (normalized.endsWith("/log.md")) return true;
  if (normalized.includes("/_system/")) return true;
  return false;
}
