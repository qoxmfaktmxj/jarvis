/**
 * apps/worker/src/jobs/wiki-lint/stale-claims.ts
 *
 * Phase-W2 T3 — stale-claim detection (WIKI-AGENTS.md §3.3).
 *
 * A page is considered stale when it has not been updated for
 * `STALE_DAYS` but at least one of its linked `raw_source` rows has been
 * re-ingested since. This indicates the LLM-generated page may be out of
 * sync with the latest source material.
 *
 * Pure SQL. Does not call LLM — the LLM contradiction judge already
 * covers the "claim mismatch" case; this check focuses on provenance
 * freshness which is cheap and deterministic.
 */

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageSourceRef } from "@jarvis/db/schema/wiki-page-source-ref";
import { rawSource } from "@jarvis/db/schema/file";
import { and, eq, sql } from "drizzle-orm";

const STALE_DAYS = Number.parseInt(
  process.env["LINT_STALE_DAYS"] ?? "30",
  10,
);

export interface StalePage {
  pageId: string;
  path: string;
  title: string;
  slug: string;
  pageUpdatedAt: Date;
  latestSourceAt: Date;
  rawSourceIds: string[];
}

/**
 * Return pages older than STALE_DAYS whose linked raw_source has been
 * re-ingested more recently. If a page has no linked raw_source at all
 * (source-less synthesis) we skip it — nothing to compare against.
 */
export async function detectStaleClaims(
  workspaceId: string,
): Promise<StalePage[]> {
  const rows = await db
    .select({
      pageId: wikiPageIndex.id,
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      pageUpdatedAt: wikiPageIndex.updatedAt,
      latestSourceAt: sql<Date>`MAX(${rawSource.updatedAt})`,
      rawSourceIds: sql<
        string[]
      >`COALESCE(array_agg(DISTINCT ${rawSource.id}) FILTER (WHERE ${rawSource.id} IS NOT NULL), ARRAY[]::uuid[])`,
    })
    .from(wikiPageIndex)
    .innerJoin(
      wikiPageSourceRef,
      and(
        eq(wikiPageSourceRef.pageId, wikiPageIndex.id),
        eq(wikiPageSourceRef.workspaceId, workspaceId),
      ),
    )
    .innerJoin(rawSource, eq(wikiPageSourceRef.rawSourceId, rawSource.id))
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        eq(wikiPageIndex.stale, false),
        sql`${wikiPageIndex.updatedAt} < now() - (${STALE_DAYS} || ' days')::interval`,
      ),
    )
    .groupBy(
      wikiPageIndex.id,
      wikiPageIndex.path,
      wikiPageIndex.title,
      wikiPageIndex.slug,
      wikiPageIndex.updatedAt,
    );

  return rows
    .filter((r) => {
      if (!r.latestSourceAt) return false;
      const sourceMs = new Date(r.latestSourceAt).getTime();
      const pageMs = new Date(r.pageUpdatedAt).getTime();
      return sourceMs > pageMs;
    })
    .map((r) => ({
      pageId: r.pageId,
      path: r.path,
      title: r.title,
      slug: r.slug,
      pageUpdatedAt: new Date(r.pageUpdatedAt),
      latestSourceAt: new Date(r.latestSourceAt),
      rawSourceIds: Array.isArray(r.rawSourceIds) ? r.rawSourceIds : [],
    }));
}
