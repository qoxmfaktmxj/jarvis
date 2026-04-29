/**
 * packages/wiki-agent/src/projection.ts
 *
 * Shared `projectLinks` utility — extracts the wikilink graph projection
 * logic originally inline in `apps/worker/src/jobs/ingest/write-and-commit.ts`.
 *
 * Used by:
 *  - `apps/worker` (ingest path, via tx inside writeAndCommit)
 *  - `apps/web`    (manual save server action, same tx as index upsert)
 *
 * Contract:
 *  - DELETE all existing "direct" outbound links for `sourcePath`.
 *  - Parse `[[wikilinks]]` from `body`, dedup by (toPath, alias, anchor).
 *  - INSERT resolved rows; `toPageId` is resolved from the DB when possible.
 *  - Caller is responsible for providing a drizzle tx (or root db) handle.
 */

import { and, eq } from "drizzle-orm";

import type { DB } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { parseWikilinks } from "@jarvis/wiki-fs";

/**
 * Drizzle transaction handle or the root db — both expose the same query
 * builder surface (identical to the DbOrTx pattern in write-and-commit.ts).
 */
export type DbOrTx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface ProjectLinksInput {
  /** Workspace UUID (used for workspaceId filter + INSERT). */
  workspaceId: string;
  /**
   * Repo-rooted path of the source page, e.g.
   * `wiki/{workspaceId}/manual/foo.md`.
   * Must already exist in `wiki_page_index` (or be in the same tx upsert).
   */
  sourcePath: string;
  /** Markdown body (frontmatter already stripped). */
  body: string;
}

/**
 * Re-project the outbound `[[wikilink]]` graph for a single page.
 *
 * Always DELETEs previous "direct" links for `sourcePath`, then INSERTs
 * the current set so stale links are cleaned up on every save.
 */
export async function projectLinks(
  tx: DbOrTx,
  { workspaceId, sourcePath, body }: ProjectLinksInput,
): Promise<void> {
  // Look up the `fromPageId` for this page.
  const fromRows = await tx
    .select({ id: wikiPageIndex.id })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.path, sourcePath),
      ),
    )
    .limit(1);

  const fromPageId = fromRows[0]?.id;
  if (!fromPageId) {
    // Page not yet in index — nothing to project (caller should upsert index first).
    return;
  }

  // Fetch all pages in this workspace for toPageId resolution.
  const existingPageRows = await tx
    .select({ id: wikiPageIndex.id, path: wikiPageIndex.path })
    .from(wikiPageIndex)
    .where(eq(wikiPageIndex.workspaceId, workspaceId));

  const allPagePaths = new Map<string, string>(
    existingPageRows.map((r) => [r.path, r.id]),
  );

  // Parse wikilinks, dedup by (toPath, alias, anchor) to satisfy unique index.
  const links = parseWikilinks(body);
  type LinkRow = {
    workspaceId: string;
    fromPageId: string;
    toPageId: string | null;
    toPath: string;
    alias: string | null;
    anchor: string | null;
    kind: "direct";
  };
  const seen = new Set<string>();
  const rowsToInsert: LinkRow[] = [];

  for (const link of links) {
    const targetRaw = link.target.trim();
    if (!targetRaw) continue;

    const targetWithExt = targetRaw.endsWith(".md")
      ? targetRaw
      : `${targetRaw}.md`;

    // Try to resolve toPageId (same logic as ingest).
    const candidates = [
      `wiki/${workspaceId}/${targetWithExt}`,
      targetWithExt,
    ];
    let toPath: string | null = null;
    for (const c of candidates) {
      if (allPagePaths.has(c)) {
        toPath = c;
        break;
      }
    }
    const finalToPath = toPath ?? targetWithExt;
    const toPageId = toPath ? (allPagePaths.get(toPath) ?? null) : null;
    const alias = link.alias ?? null;
    const anchor = link.anchor ?? null;

    // Dedup key mirrors the unique index: (fromPageId, toPath, alias, anchor).
    const dedupKey = `${finalToPath}|${alias ?? ""}|${anchor ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    rowsToInsert.push({
      workspaceId,
      fromPageId,
      toPageId,
      toPath: finalToPath,
      alias,
      anchor,
      kind: "direct",
    });
  }

  // DELETE previous outbound direct links for this page. Workspace guard
  // protects against silent cross-workspace row deletion if data drift ever
  // misaligns row.workspaceId vs page.workspaceId.
  await tx
    .delete(wikiPageLink)
    .where(
      and(
        eq(wikiPageLink.workspaceId, workspaceId),
        eq(wikiPageLink.fromPageId, fromPageId),
        eq(wikiPageLink.kind, "direct"),
      ),
    );

  // INSERT new links (onConflictDoNothing for safety).
  if (rowsToInsert.length > 0) {
    await tx.insert(wikiPageLink).values(rowsToInsert).onConflictDoNothing();
  }
}
