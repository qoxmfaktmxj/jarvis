/**
 * packages/wiki-agent/src/projection.ts
 *
 * Shared projection utilities used by BOTH the worker (ingest path) and the
 * web app (manual save server action). Centralizing these helpers preserves
 * the Karpathy SSoT invariant: disk + git is the source of truth and DB rows
 * are pure projections.
 *
 * Two helpers live here:
 *
 *  1. `projectLinks(tx, ...)`  — re-projects the wikilink graph for a single
 *     page (DELETE+INSERT). Already extracted from the original
 *     `apps/worker/src/jobs/ingest/write-and-commit.ts` inline copy.
 *
 *  2. `projectManualPage(tx, ...)` — encapsulates the full projection step
 *     that a manual (`[manual]`) commit needs:
 *       a. UPSERT `wiki_page_index` row from disk-derived frontmatter.
 *       b. INSERT `wiki_commit_log` row with `operation: 'manual'`.
 *       c. Re-project outbound `wiki_page_link` rows via `projectLinks`.
 *     This mirrors the ingest worker projection pattern (write-and-commit.ts
 *     §projectPages + projectLinks + wiki_commit_log) so the manual save
 *     server action no longer has to inline projection logic.
 *
 * Karpathy invariants enforced here:
 *  - `body`/MDX content is NEVER written to `wiki_page_index` (frontmatter only).
 *  - All three projection writes live in the caller's tx — partial failure
 *    rolls back atomically.
 *  - The helper is the single source of projection logic shared by worker
 *    and web; manual save is treated as a "sync writer" lane equivalent to
 *    the ingest sync lane, NOT as a UI bypass of the projection contract.
 *
 * Contract for `projectLinks`:
 *  - DELETE all existing "direct" outbound links for `sourcePath`.
 *  - Parse `[[wikilinks]]` from `body`, dedup by (toPath, alias, anchor).
 *  - INSERT resolved rows; `toPageId` is resolved from the DB when possible.
 *  - Caller is responsible for providing a drizzle tx (or root db) handle.
 */

import { and, eq } from "drizzle-orm";

import type { DB } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { wikiCommitLog } from "@jarvis/db/schema/wiki-commit-log";
import { parseWikilinks, type WikiFrontmatter } from "@jarvis/wiki-fs";

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

// ─────────────────────────────────────────────────────────────────────────
// projectManualPage — shared projection lane for manual `[manual]` commits.
// ─────────────────────────────────────────────────────────────────────────
//
// Mirrors the ingest worker's projection step (write-and-commit.ts) but for
// the single-page manual save path. The caller (manual save server action OR
// a future worker sync job) has already written the markdown to disk and
// produced a git commit; this helper is the **only** code that mutates the
// projection tables for that commit.
//
// Encapsulating these writes here keeps the manual save server action thin
// and ensures the Karpathy SSoT invariant ("DB is a projection, disk is the
// source of truth") is enforced by a single shared helper instead of being
// scattered across UI server actions.

/**
 * `type` enum whitelist for `wiki_page_index.type` — mirrors the SQL column
 * (varchar(20)) and `WikiPageType` in `@jarvis/wiki-fs`. Treated as the
 * canonical allowed set; anything outside this list is rewritten to
 * `"concept"` so a malicious/buggy frontmatter cannot pollute the projection
 * column (defense-in-depth for code-review HIGH F8).
 */
const WIKI_PAGE_TYPE_WHITELIST = new Set<string>([
  "source",
  "entity",
  "concept",
  "synthesis",
  "derived",
  "infra-runbook",
  "playbook",
]);

function normalizePageType(raw: unknown): string {
  if (typeof raw === "string" && WIKI_PAGE_TYPE_WHITELIST.has(raw)) {
    return raw;
  }
  return "concept";
}

/**
 * Input for `projectManualPage`.
 *
 * The caller MUST have already:
 *   1. Written the file (frontmatter + body) to disk via `wiki-fs`.
 *   2. Committed it with `GitRepo.writeAndCommit` (`[manual] ...` prefix).
 *
 * `frontmatter` should be the **disk frontmatter post-merge** (i.e. the value
 * that was just serialized + committed), so the projection mirrors what is
 * on disk.
 */
export interface ProjectManualPageInput {
  workspaceId: string;
  /** Repo-rooted path, e.g. `wiki/{workspaceId}/manual/foo/bar.md`. */
  sourcePath: string;
  /** Page slug used as the projection `slug` column. */
  slug: string;
  /** Markdown body (frontmatter already stripped). Used for wikilink scan. */
  body: string;
  /** Frontmatter as written to disk (post-merge). */
  frontmatter: Partial<WikiFrontmatter> & Record<string, unknown>;
  /** Git SHA of the commit that just landed on `main`. */
  commitSha: string;
  /**
   * User id that performed the manual save. Stored in `wiki_commit_log.authorRef`
   * for audit traceability. Use the session userId (UUID) so it joins to `user`.
   */
  userId: string;
  /** Optional commit-log reasoning override; defaults to `"manual save"`. */
  reasoning?: string;
}

/**
 * Run the projection step for a single manual page commit.
 *
 * Writes inside the caller's tx:
 *  1. UPSERT `wiki_page_index` (frontmatter columns only, never body).
 *  2. INSERT `wiki_commit_log` (operation=`manual`, authorType=`user`).
 *  3. DELETE+INSERT `wiki_page_link` outbound edges via `projectLinks`.
 *
 * Throws on any DB error so the caller's tx rolls back. Returns the
 * affected page row id so callers can correlate audit logs.
 *
 * @example
 *   await db.transaction(async (tx) => {
 *     const pageId = await projectManualPage(tx, {
 *       workspaceId, sourcePath, slug, body, frontmatter,
 *       commitSha: sha, userId: session.userId,
 *     });
 *     await writeAuditLog(tx, auditLog, {
 *       workspaceId, userId: session.userId,
 *       action: "wiki.manual.save",
 *       resourceType: "wiki_page",
 *       resourceId: pageId,
 *       details: { sha, sourcePath },
 *     });
 *   });
 */
export async function projectManualPage(
  tx: DbOrTx,
  input: ProjectManualPageInput,
): Promise<string> {
  const fm = input.frontmatter;
  const projectionColumns = {
    title:
      typeof fm["title"] === "string" && (fm["title"] as string).length > 0
        ? (fm["title"] as string)
        : input.slug,
    slug: input.slug,
    type: normalizePageType(fm["type"]),
    authority: "manual" as const,
    sensitivity: (fm["sensitivity"] ?? "INTERNAL") as string,
    requiredPermission:
      typeof fm["requiredPermission"] === "string"
        ? (fm["requiredPermission"] as string)
        : "knowledge:read",
    frontmatter: fm as Record<string, unknown>,
    gitSha: input.commitSha,
    stale: false,
    publishedStatus: "published" as const,
    freshnessSlaDays:
      typeof fm["freshnessSlaDays"] === "number"
        ? (fm["freshnessSlaDays"] as number)
        : null,
  };

  const inserted = await tx
    .insert(wikiPageIndex)
    .values({
      workspaceId: input.workspaceId,
      path: input.sourcePath,
      ...projectionColumns,
    })
    .onConflictDoUpdate({
      target: [wikiPageIndex.workspaceId, wikiPageIndex.path],
      set: {
        ...projectionColumns,
        updatedAt: new Date(),
      },
    })
    .returning({ id: wikiPageIndex.id });

  const pageId = inserted[0]?.id;
  if (!pageId) {
    throw new Error(
      `[wiki:projectManualPage] upsert returned no row for ${input.sourcePath}`,
    );
  }

  // wiki_commit_log — `manual` operation, `user` authorType.
  await tx.insert(wikiCommitLog).values({
    workspaceId: input.workspaceId,
    commitSha: input.commitSha,
    operation: "manual",
    authorType: "user",
    authorRef: input.userId,
    affectedPages: [pageId],
    reasoning: input.reasoning ?? `manual save ${input.sourcePath}`,
  });

  // Re-project outbound wikilink edges. Runs after the index upsert in the
  // same tx so `fromPageId` resolves correctly.
  await projectLinks(tx, {
    workspaceId: input.workspaceId,
    sourcePath: input.sourcePath,
    body: input.body,
  });

  return pageId;
}
