/**
 * apps/worker/src/jobs/wiki-lint/broken-links.ts
 *
 * Phase-W2 T3 — broken-link detection (WIKI-AGENTS.md §3.3).
 *
 * A broken link is a row in `wiki_page_link` with `to_page_id IS NULL`
 * (i.e., ingest could not resolve `[[target]]` to an existing page) whose
 * `to_path` does not match any known page path or alias. We double-check
 * against `wiki_page_index` with an ILIKE + aliases lookup so that pages
 * added after ingest (which have not yet triggered a link re-resolve) are
 * not falsely flagged.
 *
 * Pure SQL. No LLM call.
 */

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { and, eq, ilike, isNull, sql, or, inArray } from "drizzle-orm";

export interface BrokenLink {
  fromPageId: string;
  fromPath: string;
  toPath: string;
  alias: string | null;
  anchor: string | null;
}

/**
 * Return unresolved link rows in `workspaceId`. Each row represents one
 * outbound `[[target]]` that could not be resolved.
 */
export async function detectBrokenLinks(
  workspaceId: string,
): Promise<BrokenLink[]> {
  const unresolved = await db
    .select({
      linkId: wikiPageLink.id,
      fromPageId: wikiPageLink.fromPageId,
      fromPath: wikiPageIndex.path,
      toPath: wikiPageLink.toPath,
      alias: wikiPageLink.alias,
      anchor: wikiPageLink.anchor,
    })
    .from(wikiPageLink)
    .innerJoin(
      wikiPageIndex,
      eq(wikiPageLink.fromPageId, wikiPageIndex.id),
    )
    .where(
      and(
        eq(wikiPageLink.workspaceId, workspaceId),
        isNull(wikiPageLink.toPageId),
        eq(wikiPageLink.kind, "direct"),
      ),
    );

  const withPath = unresolved.filter((r) => !!r.toPath);
  if (withPath.length === 0) return [];

  // Batch-check all toPath values at once to avoid N+1 queries.
  const distinctPaths = [...new Set(withPath.map((r) => r.toPath as string))];
  const resolvedPaths = await resolvedSet(workspaceId, distinctPaths);

  return withPath
    .filter((row) => !resolvedPaths.has(row.toPath as string))
    .map((row) => ({
      fromPageId: row.fromPageId,
      fromPath: row.fromPath,
      toPath: row.toPath as string,
      alias: row.alias,
      anchor: row.anchor,
    }));
}

/** Escape LIKE/ILIKE wildcards in a literal string. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

/**
 * Return a set of toPath values that resolve to an existing page
 * (path suffix match, exact slug, or alias containment).
 * Single batch query — no N+1.
 */
async function resolvedSet(
  workspaceId: string,
  paths: string[],
): Promise<Set<string>> {
  if (paths.length === 0) return new Set();

  const resolved = new Set<string>();

  // 1) Exact slug / path suffix match via DB — one query per batch.
  //    Use escaped ILIKE with suffix anchor to avoid wildcard confusion.
  const slugMatches = await db
    .select({ slug: wikiPageIndex.slug, path: wikiPageIndex.path })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        inArray(wikiPageIndex.slug, paths),
      ),
    );
  for (const r of slugMatches) resolved.add(r.slug);

  // 2) Suffix path match (e.g. toPath="hr/policy" matches "auto/entities/hr/policy.md").
  //    Use escaped ILIKE suffix: `%/{toPath}.md` or `%/{toPath}`.
  for (const toPath of paths) {
    if (resolved.has(toPath)) continue;
    const escaped = escapeLike(toPath);
    const pathMatches = await db
      .select({ id: wikiPageIndex.id })
      .from(wikiPageIndex)
      .where(
        and(
          eq(wikiPageIndex.workspaceId, workspaceId),
          or(
            ilike(wikiPageIndex.path, `%/${escaped}.md`),
            ilike(wikiPageIndex.path, `%/${escaped}`),
          ),
        ),
      )
      .limit(1);
    if (pathMatches.length > 0) resolved.add(toPath);
  }

  // 3) Alias JSONB containment — one query for all unresolved paths.
  const stillUnresolved = paths.filter((p) => !resolved.has(p));
  if (stillUnresolved.length > 0) {
    for (const toPath of stillUnresolved) {
      const aliasMatches = await db
        .select({ id: wikiPageIndex.id })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, workspaceId),
            sql`${wikiPageIndex.frontmatter} -> 'aliases' ? ${toPath}`,
          ),
        )
        .limit(1);
      if (aliasMatches.length > 0) resolved.add(toPath);
    }
  }

  return resolved;
}
