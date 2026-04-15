/**
 * apps/worker/src/jobs/wiki-lint/missing-cross-refs.ts
 *
 * Phase-W2 T3 — suggest missing cross-references (WIKI-AGENTS.md §3.3).
 *
 * A page with zero outbound `[[wikilink]]` (no-outlinks) is structurally
 * isolated. For each such page we propose candidate targets that share
 * tags/aliases — a lexical, LLM-free heuristic so cost stays bounded.
 *
 * We emit one `MissingCrossRef` per (from,to) pair. The admin UI decides
 * whether to accept the suggestion; we never write to the wiki.
 */

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { and, eq, sql } from "drizzle-orm";

const MAX_SUGGESTIONS_PER_PAGE = 3;

export interface MissingCrossRef {
  fromPageId: string;
  fromPath: string;
  fromTitle: string;
  toPageId: string;
  toPath: string;
  toTitle: string;
  /** Lexical signal that triggered the suggestion (`tag:foo` / `alias:bar`). */
  reason: string;
  /** Jaccard-like similarity in [0,1]. */
  score: number;
}

interface PageRow {
  id: string;
  path: string;
  title: string;
  slug: string;
  tags: string[];
  aliases: string[];
}

/**
 * Return suggestions for pages with no outbound direct links. At most
 * `MAX_SUGGESTIONS_PER_PAGE` per source page to avoid review-queue flood.
 */
export async function suggestMissingCrossRefs(
  workspaceId: string,
): Promise<MissingCrossRef[]> {
  const pages = await loadPages(workspaceId);
  if (pages.length < 2) return [];

  const noOutlinkIds = await loadNoOutlinkPageIds(workspaceId);
  if (noOutlinkIds.size === 0) return [];

  const results: MissingCrossRef[] = [];
  for (const source of pages) {
    if (!noOutlinkIds.has(source.id)) continue;

    const scored: Array<{ page: PageRow; score: number; reason: string }> = [];
    for (const candidate of pages) {
      if (candidate.id === source.id) continue;
      const sim = lexicalSimilarity(source, candidate);
      if (sim.score <= 0) continue;
      scored.push({ page: candidate, score: sim.score, reason: sim.reason });
    }

    scored.sort((a, b) => b.score - a.score);

    for (const hit of scored.slice(0, MAX_SUGGESTIONS_PER_PAGE)) {
      results.push({
        fromPageId: source.id,
        fromPath: source.path,
        fromTitle: source.title,
        toPageId: hit.page.id,
        toPath: hit.page.path,
        toTitle: hit.page.title,
        reason: hit.reason,
        score: hit.score,
      });
    }
  }

  return results;
}

// ── helpers ──────────────────────────────────────────────────────────────

async function loadPages(workspaceId: string): Promise<PageRow[]> {
  const rows = await db
    .select({
      id: wikiPageIndex.id,
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      frontmatter: wikiPageIndex.frontmatter,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        eq(wikiPageIndex.stale, false),
      ),
    );

  return rows.map((r) => {
    const fm = r.frontmatter as Record<string, unknown>;
    const tags = Array.isArray(fm["tags"])
      ? (fm["tags"] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const aliases = Array.isArray(fm["aliases"])
      ? (fm["aliases"] as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    return {
      id: r.id,
      path: r.path,
      title: r.title,
      slug: r.slug,
      tags,
      aliases,
    };
  });
}

async function loadNoOutlinkPageIds(
  workspaceId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      pageId: wikiPageIndex.id,
      outCount: sql<number>`COUNT(${wikiPageLink.id})::int`,
    })
    .from(wikiPageIndex)
    .leftJoin(
      wikiPageLink,
      and(
        eq(wikiPageLink.fromPageId, wikiPageIndex.id),
        eq(wikiPageLink.workspaceId, workspaceId),
        eq(wikiPageLink.kind, "direct"),
      ),
    )
    .where(eq(wikiPageIndex.workspaceId, workspaceId))
    .groupBy(wikiPageIndex.id);

  const set = new Set<string>();
  for (const r of rows) if (Number(r.outCount) === 0) set.add(r.pageId);
  return set;
}

/**
 * Lexical similarity between two pages. Exposed for unit tests.
 *
 * - Tag overlap: Jaccard over tag sets.
 * - Alias overlap: fraction of aliases sharing a case-insensitive match.
 * - Reason reports the first positive signal.
 */
export function lexicalSimilarity(
  a: { tags: string[]; aliases: string[] },
  b: { tags: string[]; aliases: string[] },
): { score: number; reason: string } {
  const aTags = new Set(a.tags);
  const bTags = new Set(b.tags);
  const tagInter = [...aTags].filter((t) => bTags.has(t)).length;
  const tagUnion = new Set([...aTags, ...bTags]).size;
  const tagScore = tagUnion === 0 ? 0 : tagInter / tagUnion;

  const aAliases = new Set(a.aliases.map((s) => s.toLowerCase()));
  const bAliases = new Set(b.aliases.map((s) => s.toLowerCase()));
  const aliasInter = [...aAliases].filter((t) => bAliases.has(t)).length;
  const aliasUnion = new Set([...aAliases, ...bAliases]).size;
  const aliasScore = aliasUnion === 0 ? 0 : aliasInter / aliasUnion;

  // Weight aliases slightly higher — alias overlap is a stronger signal
  // (MindVault regression prevention: "마인드볼트" should link concept
  // pages).
  const score = Math.max(tagScore, aliasScore * 1.2);

  let reason = "";
  if (aliasInter > 0) {
    const firstShared = [...aAliases].find((x) => bAliases.has(x));
    reason = `alias:${firstShared}`;
  } else if (tagInter > 0) {
    const firstShared = [...aTags].find((x) => bTags.has(x));
    reason = `tag:${firstShared}`;
  }

  return { score: Math.min(score, 1), reason };
}
