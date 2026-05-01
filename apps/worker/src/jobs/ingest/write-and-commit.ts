/**
 * Step C — Write, validate, commit, and project to DB.
 *
 * This is the heart of the W2 wiki ingest pipeline. We:
 *  1. Open a temp worktree off the workspace's wiki repo so a failed
 *     validate doesn't pollute `main`.
 *  2. Substitute `{RUNTIME_INJECTED}` placeholders in each FILE block's
 *     frontmatter (workspaceId, created/updated timestamps, sources).
 *  3. Validate every FILE block (frontmatter parses, aliases ≥ 3, wikilinks
 *     resolve to either existing pages or other blocks in this batch,
 *     sensitivity is consistent with the input source).
 *  4. If validate fails → DO NOT commit, route to ingest_dlq, cleanup.
 *  5. If validate passes → atomicWrite all files inside the worktree, commit
 *     with the canonical `[ingest]` prefix, fast-forward merge into `main`.
 *  6. Project the commit + each affected page into wiki_commit_log,
 *     wiki_page_index, wiki_page_link.
 *  7. Append a one-line entry to `log.md`.
 *  8. ALWAYS cleanup the temp worktree in `finally`.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import { eq, and, inArray, sql } from "drizzle-orm";

import { db, type DB } from "@jarvis/db/client";

/**
 * Drizzle transaction handle or the root db — both expose the same query
 * builder surface used by `projectPages` / `projectLinks`.
 */
type DbOrTx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import { wikiCommitLog } from "@jarvis/db/schema/wiki-commit-log";
import {
  GitRepo,
  atomicWrite,
  exists,
  parseFrontmatter,
  serializeFrontmatter,
  parseWikilinks,
  createTempWorktree,
  type WikiFrontmatter,
  type WikiSensitivity,
  type TempWorktreeHandle,
} from "@jarvis/wiki-fs";
import {
  MIN_ALIASES,
  type FileBlock,
  type ReviewBlock,
} from "@jarvis/wiki-agent";

import { wikiWorkspaceRoot } from "./analyze.js";

// ── Types ─────────────────────────────────────────────────────────────────

export interface WriteAndCommitInput {
  rawSourceId: string;
  workspaceId: string;
  fileBlocks: FileBlock[];
  reviewBlocks: ReviewBlock[];
  /** Sensitivity inherited from the source; downstream sensitivity may rise. */
  sourceSensitivity: WikiSensitivity;
  /** Source filename for the commit message. */
  sourceTitle: string;
  /** Run id for log lines / temp branch names. */
  runId: string;
  /**
   * Raw LLM output (Step B). When validate fails, the text is persisted to
   * ingest_dlq payload so operators can diagnose the failure without re-running
   * the generation LLM. Truncated to 8000 chars inside `recordIngestDlq`.
   */
  rawText?: string;
}

export interface ValidationFailure {
  /** Repo-relative wiki path of the offending file. */
  path: string;
  /** Validation rule that fired (e.g. "aliases<3", "broken-wikilink"). */
  rule: string;
  /** Human-readable detail. */
  detail: string;
}

export interface WriteAndCommitResult {
  ok: boolean;
  /** Populated only on success. */
  commitSha?: string;
  /** Workspace-relative paths actually written/committed. */
  affectedPaths: string[];
  /** Validation failures (empty on success). */
  failures: ValidationFailure[];
  /** New page count (excludes log.md / index.md). */
  newPageCount: number;
  /** Updated page count (existing pages, excludes bookkeeping). */
  updatedPageCount: number;
  /** Sum of new + updated content pages. */
  contentPageCount: number;
}

// ── Frontmatter substitution ──────────────────────────────────────────────

const PLACEHOLDER = "{RUNTIME_INJECTED}";

interface SubstitutedBlock {
  /** Original repo-relative wiki path (without workspace prefix). */
  relPath: string;
  /** Repo-rooted wiki path: `wiki/{workspaceId}/{relPath}`. */
  wikiPath: string;
  /** Body content with frontmatter substituted. */
  content: string;
  /** Parsed frontmatter (post-substitution). */
  frontmatter: WikiFrontmatter;
  /** Body without frontmatter — used for wikilink scan. */
  body: string;
  /** True when this block targets index.md / log.md (bookkeeping). */
  isBookkeeping: boolean;
  /** Append vs overwrite (log.md → append). */
  mode: "append" | "overwrite";
}

/**
 * Validate that `rawPath` (from LLM output) is safe to write under the
 * workspace's auto wiki subtree (`wiki/{workspaceId}/`).
 *
 * Returns the normalized relPath (forward-slash, no leading slash) on
 * success, or null when the path must be rejected.
 *
 * Allowlist (Karpathy boundary — defense in depth, not just prompt):
 *  - `index.md` and `log.md` at the workspace root (bookkeeping)
 *  - `auto/<sub>/<...>.md` (content pages — LLM-owned subtree)
 *
 * Anything else (`manual/**`, `_system/**`, `_archive/**`, root `.md` files
 * other than index/log) is rejected. The system prompt also tells the LLM
 * not to write outside `auto/`, but that prompt-only guard breaks under
 * prompt injection or model error — this code-level allowlist closes it.
 */
function validateBlockPath(
  rawPath: string,
  workspaceId: string,
): { relPath: string } | null {
  // Normalize backslashes to forward slashes.
  const normalized = rawPath.replace(/\\/g, "/");
  // Strip leading slashes.
  const relPath = normalized.replace(/^\/+/, "");

  // Reject empty path.
  if (relPath.length === 0) return null;
  // Reject paths that don't end in .md.
  if (!relPath.endsWith(".md")) return null;
  // Reject absolute paths (POSIX or Windows drive letters).
  if (path.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath)) return null;
  // Reject any `..` or `.` segment (path traversal / weird normalization).
  const parts = relPath.split("/");
  if (parts.some((p) => p === ".." || p === ".")) return null;
  // Reject empty segments (e.g. "auto//foo.md").
  if (parts.some((p) => p.length === 0)) return null;

  // Allowlist: bookkeeping (root only) OR auto/** content pages.
  const isRootBookkeeping = relPath === "index.md" || relPath === "log.md";
  const isAutoContent =
    parts.length >= 2 && parts[0] === "auto" && relPath.endsWith(".md");
  if (!isRootBookkeeping && !isAutoContent) return null;

  // Confirm that the resolved path stays inside wiki/{workspaceId}/.
  // We check this symbolically here; the atomicWrite site does a second
  // check with the actual resolved absolute path.
  const wikiPath = `wiki/${workspaceId}/${relPath}`;
  const normalizedJoined = path.posix.normalize(wikiPath);
  if (!normalizedJoined.startsWith(`wiki/${workspaceId}/`)) return null;

  return { relPath };
}

type SubstituteFailure = { rule: "invalid-path" | "malformed-frontmatter"; detail: string };

function substituteFrontmatter(
  block: FileBlock,
  workspaceId: string,
  rawSourceId: string,
  sourceSensitivity: WikiSensitivity,
): SubstitutedBlock | SubstituteFailure {
  // Validate path before any other processing to prevent directory traversal.
  const pathCheck = validateBlockPath(block.path, workspaceId);
  if (pathCheck === null) {
    return { rule: "invalid-path", detail: `block.path "${block.path}" failed boundary check (must be a non-empty .md path under wiki/${workspaceId}/ with no .. segments)` };
  }

  // Bookkeeping files (root index.md, log.md) don't have frontmatter —
  // pass them through untouched. validateBlockPath has already rejected
  // any nested index.md / log.md, so a strict equality match is correct.
  const relPath = pathCheck.relPath;
  const isBookkeeping = relPath === "index.md" || relPath === "log.md";
  const wikiPath = `wiki/${workspaceId}/${relPath}`;

  if (isBookkeeping) {
    return {
      relPath,
      wikiPath,
      content: block.content,
      frontmatter: {} as WikiFrontmatter,
      body: block.content,
      isBookkeeping: true,
      mode: block.mode ?? "append",
    };
  }

  // For content pages we MUST have frontmatter; failures bubble up to validate.
  let parsed: { data: WikiFrontmatter; body: string };
  try {
    parsed = parseFrontmatter(block.content);
  } catch (err) {
    // Malformed frontmatter — return failure so validate logs it.
    void err;
    return { rule: "malformed-frontmatter", detail: "YAML frontmatter failed to parse" };
  }

  const now = new Date().toISOString();
  const fm: WikiFrontmatter = {
    ...parsed.data,
    workspaceId,
    // Authority is auto for any LLM-generated page.
    authority: "auto",
    // sensitivity floor: never demote below source.
    sensitivity: maxSensitivity(parsed.data.sensitivity, sourceSensitivity),
    sources:
      parsed.data.sources && parsed.data.sources.length > 0
        ? parsed.data.sources
        : [rawSourceId],
    created: parsed.data.created && parsed.data.created !== PLACEHOLDER ? parsed.data.created : now,
    updated: now,
  };

  // Replace any leftover string placeholders in known string fields.
  for (const key of ["title", "requiredPermission"] as const) {
    if (fm[key] === PLACEHOLDER) fm[key] = "";
  }

  const content = serializeFrontmatter(fm, parsed.body);

  return {
    relPath,
    wikiPath,
    content,
    frontmatter: fm,
    body: parsed.body,
    isBookkeeping: false,
    mode: block.mode ?? "overwrite",
  };
}

const SENSITIVITY_ORDER: Record<WikiSensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  RESTRICTED: 2,
  SECRET_REF_ONLY: 3,
};

function maxSensitivity(a: WikiSensitivity, b: WikiSensitivity): WikiSensitivity {
  return SENSITIVITY_ORDER[a] >= SENSITIVITY_ORDER[b] ? a : b;
}

// ── Validation ────────────────────────────────────────────────────────────

function validate(
  blocks: SubstitutedBlock[],
  existingPaths: Set<string>,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const batchPaths = new Set<string>();
  const batchTargets = new Set<string>(); // target slugs without .md, etc.

  for (const block of blocks) {
    batchPaths.add(block.relPath);
    // Add likely wikilink target spellings for cross-batch resolution.
    const noExt = block.relPath.replace(/\.md$/, "");
    batchTargets.add(noExt);
    const basename = path.basename(noExt);
    batchTargets.add(basename);
  }

  for (const block of blocks) {
    if (block.isBookkeeping) continue;

    // Frontmatter sanity
    if (!block.frontmatter.title || block.frontmatter.title.trim().length === 0) {
      failures.push({ path: block.relPath, rule: "missing-title", detail: "frontmatter.title is empty" });
    }
    if (!block.frontmatter.workspaceId || block.frontmatter.workspaceId === PLACEHOLDER) {
      failures.push({ path: block.relPath, rule: "missing-workspaceId", detail: "frontmatter.workspaceId not injected" });
    }

    // Aliases ≥ MIN_ALIASES (3)
    const aliasCount = Array.isArray(block.frontmatter.aliases)
      ? block.frontmatter.aliases.filter((a) => typeof a === "string" && a.trim().length > 0).length
      : 0;
    if (aliasCount < MIN_ALIASES) {
      failures.push({
        path: block.relPath,
        rule: "aliases<3",
        detail: `aliases=${aliasCount} (min ${MIN_ALIASES})`,
      });
    }

    // Wikilinks must resolve: either existing index OR same-batch FILE block.
    const links = parseWikilinks(block.body);
    for (const link of links) {
      const target = link.target.trim();
      if (target.length === 0) continue;
      const noExt = target.replace(/\.md$/, "");
      const basename = path.basename(noExt);

      const inBatch =
        batchTargets.has(noExt) ||
        batchTargets.has(basename) ||
        batchPaths.has(target) ||
        batchPaths.has(`${noExt}.md`);
      const inExisting =
        existingPaths.has(target) ||
        existingPaths.has(`${noExt}.md`) ||
        Array.from(existingPaths).some((p) => p.endsWith(`/${basename}.md`) || p === `${basename}.md`);

      if (!inBatch && !inExisting) {
        failures.push({
          path: block.relPath,
          rule: "broken-wikilink",
          detail: `[[${target}]] does not resolve to existing or batch page`,
        });
      }
    }
  }

  return failures;
}

// ── DLQ helper ────────────────────────────────────────────────────────────

import { wikiReviewQueue } from "@jarvis/db/schema/wiki-review-queue";

async function recordIngestDlq(input: {
  workspaceId: string;
  rawSourceId: string;
  failures: ValidationFailure[];
  rawText?: string;
}): Promise<void> {
  await db.insert(wikiReviewQueue).values({
    workspaceId: input.workspaceId,
    kind: "ingest_fail",
    affectedPages: input.failures.map((f) => f.path),
    description: `validate failed for raw_source=${input.rawSourceId}: ${input.failures.length} rule violations`,
    payload: {
      rawSourceId: input.rawSourceId,
      failures: input.failures,
      // Truncate raw to keep payload bounded.
      rawText: input.rawText?.slice(0, 8000) ?? "",
    },
    status: "pending",
  });
}

// ── DB projection ─────────────────────────────────────────────────────────

/**
 * Decide publishedStatus for a single wiki page:
 * - "draft" when sensitivity is RESTRICTED or SECRET_REF_ONLY (conservative default for high-sensitivity LLM content)
 * - "draft" when frontmatter has requiredPermission set to non-empty, non-default value
 * - "draft" when frontmatter has reviewRequired: true
 * - "draft" when frontmatter sensitivity was escalated above the source's baseline sensitivity
 * - "draft" when the page is flagged in a contradiction/review signal
 * - "published" otherwise
 */
function derivePublishedStatus(
  fm: WikiFrontmatter,
  sourceSensitivity: WikiSensitivity,
  hasContradiction: boolean,
): "draft" | "published" {
  // High-sensitivity content always starts as draft.
  if (fm.sensitivity === "RESTRICTED" || fm.sensitivity === "SECRET_REF_ONLY") {
    return "draft";
  }
  // Sensitivity was bumped above source baseline → requires review.
  if (SENSITIVITY_ORDER[fm.sensitivity] > SENSITIVITY_ORDER[sourceSensitivity]) {
    return "draft";
  }
  // Non-default requiredPermission means restricted access → keep draft.
  const perm = fm.requiredPermission ?? "";
  if (perm.length > 0 && perm !== "knowledge:read") {
    return "draft";
  }
  // Explicit frontmatter review flag.
  if (fm["reviewRequired"] === true) {
    return "draft";
  }
  // Contradiction signal from Step A / Step B.
  if (hasContradiction) {
    return "draft";
  }
  return "published";
}

async function projectPages(opts: {
  workspaceId: string;
  blocks: SubstitutedBlock[];
  commitSha: string;
  sourceSensitivity: WikiSensitivity;
  /** relPaths (not wikiPaths) of blocks that carry a contradiction signal. */
  contradictionPaths: Set<string>;
  tx?: DbOrTx;
}): Promise<{ pathToId: Map<string, string>; newCount: number; updatedCount: number }> {
  const pathToId = new Map<string, string>();
  const executor: DbOrTx = opts.tx ?? db;

  const contentBlocks = opts.blocks.filter((b) => !b.isBookkeeping);
  if (contentBlocks.length === 0) {
    return { pathToId, newCount: 0, updatedCount: 0 };
  }

  const paths = contentBlocks.map((b) => b.wikiPath);

  // 1) Batch SELECT to detect new vs updated (single IN-query instead of N queries).
  const existingRows = await executor
    .select({ path: wikiPageIndex.path })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, opts.workspaceId),
        inArray(wikiPageIndex.path, paths),
      ),
    );
  const existingPathSet = new Set(existingRows.map((r) => r.path));
  const updatedCount = contentBlocks.filter((b) => existingPathSet.has(b.wikiPath)).length;
  const newCount = contentBlocks.length - updatedCount;

  // 2) Batch INSERT ... ON CONFLICT DO UPDATE with all rows at once.
  const now = new Date();
  const rows = contentBlocks.map((block) => {
    const slug = path.basename(block.relPath).replace(/\.md$/, "");
    const routeKey = block.relPath.replace(/\.md$/, "");
    const fm = block.frontmatter;
    return {
      workspaceId: opts.workspaceId,
      path: block.wikiPath,
      title: fm.title || slug,
      slug,
      routeKey,
      type: (fm.type as string) ?? "concept",
      authority: (fm.authority as string) ?? "auto",
      sensitivity: (fm.sensitivity as string) ?? "INTERNAL",
      requiredPermission: (fm.requiredPermission as string) ?? "knowledge:read",
      frontmatter: fm as Record<string, unknown>,
      gitSha: opts.commitSha,
      stale: false,
      // Draft pages require human review before going live.
      publishedStatus: derivePublishedStatus(
        fm,
        opts.sourceSensitivity,
        opts.contradictionPaths.has(block.relPath),
      ),
    };
  });

  const inserted = await executor
    .insert(wikiPageIndex)
    .values(rows)
    .onConflictDoUpdate({
      target: [wikiPageIndex.workspaceId, wikiPageIndex.path],
      set: {
        // Reference the excluded row (the incoming values) so each target
        // row receives its own update payload in this batched upsert.
        title: sql`excluded.title`,
        slug: sql`excluded.slug`,
        routeKey: sql`excluded.route_key`,
        type: sql`excluded.type`,
        authority: sql`excluded.authority`,
        sensitivity: sql`excluded.sensitivity`,
        requiredPermission: sql`excluded.required_permission`,
        frontmatter: sql`excluded.frontmatter`,
        gitSha: sql`excluded.git_sha`,
        stale: sql`excluded.stale`,
        freshnessSlaDays: sql`excluded.freshness_sla_days`,
        updatedAt: now,
      },
    })
    .returning({ id: wikiPageIndex.id, path: wikiPageIndex.path });

  for (const row of inserted) {
    pathToId.set(row.path, row.id);
  }

  return { pathToId, newCount, updatedCount };
}

async function projectLinks(opts: {
  workspaceId: string;
  blocks: SubstitutedBlock[];
  pathToId: Map<string, string>;
  tx?: DbOrTx;
}): Promise<void> {
  const executor: DbOrTx = opts.tx ?? db;

  // Query ALL existing pages in this workspace so wikilinks to pages outside
  // the current batch can be resolved (fixes toPageId = NULL bug).
  const existingPageRows = await executor
    .select({ id: wikiPageIndex.id, path: wikiPageIndex.path })
    .from(wikiPageIndex)
    .where(eq(wikiPageIndex.workspaceId, opts.workspaceId));

  const existingPagePathToId = new Map<string, string>(
    existingPageRows.map((r) => [r.path, r.id]),
  );

  // Merge: batch-upserted pages take priority over stale DB rows.
  const allPagePaths = new Map<string, string>([
    ...existingPagePathToId,
    ...opts.pathToId,
  ]);

  // Collect all `fromPageId`s once so we can wipe their outbound direct links
  // in a SINGLE DELETE ... WHERE from_page_id IN (...) instead of one per block.
  const fromIds: string[] = [];
  const rowsToInsert: Array<{
    workspaceId: string;
    fromPageId: string;
    toPageId: string | null;
    toPath: string;
    alias: string | null;
    anchor: string | null;
    kind: "direct";
  }> = [];

  for (const block of opts.blocks) {
    if (block.isBookkeeping) continue;
    const fromId = allPagePaths.get(block.wikiPath);
    if (!fromId) continue;
    fromIds.push(fromId);

    const links = parseWikilinks(block.body);
    for (const link of links) {
      const targetRaw = link.target.trim();
      if (!targetRaw) continue;
      const targetWithExt = targetRaw.endsWith(".md") ? targetRaw : `${targetRaw}.md`;
      // Try to resolve: same-batch first, then existing DB pages.
      const candidates = [
        `wiki/${opts.workspaceId}/${targetWithExt}`,
        targetWithExt,
      ];
      let toPath: string | null = null;
      for (const c of candidates) {
        if (allPagePaths.has(c)) { toPath = c; break; }
      }
      const finalToPath = toPath ?? targetWithExt;
      const toPageId = toPath ? allPagePaths.get(toPath) ?? null : null;

      rowsToInsert.push({
        workspaceId: opts.workspaceId,
        fromPageId: fromId,
        toPageId,
        toPath: finalToPath,
        alias: link.alias ?? null,
        anchor: link.anchor ?? null,
        kind: "direct",
      });
    }
  }

  // Single batched DELETE for all outbound direct links of these pages.
  if (fromIds.length > 0) {
    await executor
      .delete(wikiPageLink)
      .where(
        and(
          inArray(wikiPageLink.fromPageId, fromIds),
          eq(wikiPageLink.kind, "direct"),
        ),
      );
  }

  // Single batched INSERT for all links.
  if (rowsToInsert.length > 0) {
    await executor
      .insert(wikiPageLink)
      .values(rowsToInsert)
      .onConflictDoNothing();
  }
}

// ── Main entrypoint ───────────────────────────────────────────────────────

export async function writeAndCommit(
  input: WriteAndCommitInput,
): Promise<WriteAndCommitResult> {
  const repoRoot = wikiWorkspaceRoot(input.workspaceId);

  // Substitute placeholders in every block.
  const subBlocks: SubstitutedBlock[] = [];
  const substitutionFailures: ValidationFailure[] = [];
  for (const block of input.fileBlocks) {
    const sub = substituteFrontmatter(
      block,
      input.workspaceId,
      input.rawSourceId,
      input.sourceSensitivity,
    );
    if ("rule" in sub) {
      substitutionFailures.push({
        path: block.path,
        rule: sub.rule,
        detail: sub.detail,
      });
      continue;
    }
    subBlocks.push(sub);
  }

  // Snapshot existing wiki paths for wikilink resolution.
  const existingProjection = await db
    .select({ path: wikiPageIndex.path })
    .from(wikiPageIndex)
    .where(eq(wikiPageIndex.workspaceId, input.workspaceId));
  const existingPaths = new Set<string>(
    existingProjection.map((r) => r.path.replace(`wiki/${input.workspaceId}/`, "")),
  );

  // Validate.
  const validationFailures = validate(subBlocks, existingPaths);
  const allFailures = [...substitutionFailures, ...validationFailures];

  if (allFailures.length > 0) {
    await recordIngestDlq({
      workspaceId: input.workspaceId,
      rawSourceId: input.rawSourceId,
      failures: allFailures,
      ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
    });
    return {
      ok: false,
      affectedPaths: [],
      failures: allFailures,
      newPageCount: 0,
      updatedPageCount: 0,
      contentPageCount: 0,
    };
  }

  // Ensure repo exists; bootstrap empty workspace if needed.
  const mainRepo = new GitRepo(repoRoot);
  if (!(await exists(path.join(repoRoot, ".git")))) {
    await mainRepo.createRepo("main");
  }

  // Open temp worktree.
  let worktree: TempWorktreeHandle | null = null;
  try {
    worktree = await createTempWorktree(mainRepo, {
      branch: `ingest-${input.runId}`,
    });
    const wtRepo = new GitRepo(worktree.worktreePath);

    // Defensive write boundary: every block must resolve inside the workspace's
    // auto wiki subtree. validateBlockPath already ran during substitution, but
    // we assert again here using the real worktree path so OS path resolution
    // cannot surface a bypass (e.g. symlinks in worktreePath).
    const allowedPrefix =
      path.resolve(worktree.worktreePath, "wiki", input.workspaceId) + path.sep;

    // atomicWrite each file inside worktree (handles append for log.md).
    const filesForCommit: Record<string, string> = {};
    for (const block of subBlocks) {
      const absPath = path.join(worktree.worktreePath, block.wikiPath);
      const resolvedAbs = path.resolve(absPath);
      if (!resolvedAbs.startsWith(allowedPrefix)) {
        throw new Error(
          `[ingest:writeAndCommit] boundary violation: resolved path "${resolvedAbs}" is outside allowed prefix "${allowedPrefix}" for block.wikiPath="${block.wikiPath}"`,
        );
      }
      let finalContent = block.content;
      if (block.mode === "append" && (await exists(absPath))) {
        const prev = await fs.readFile(absPath, "utf-8");
        finalContent = `${prev.replace(/\s+$/, "")}\n${block.content.trim()}\n`;
      }
      await atomicWrite(absPath, finalContent);
      filesForCommit[block.wikiPath] = finalContent;
    }

    // Append a one-line log.md entry if the LLM didn't.
    const logRel = `wiki/${input.workspaceId}/log.md`;
    if (!filesForCommit[logRel]) {
      const logAbs = path.join(worktree.worktreePath, logRel);
      const today = new Date().toISOString().slice(0, 10);
      const newCount = subBlocks.filter((b) => !b.isBookkeeping).length;
      const line = `## [${today}] ingest | ${input.sourceTitle} — ${newCount} pages updated`;
      let next = "";
      if (await exists(logAbs)) {
        const prev = await fs.readFile(logAbs, "utf-8");
        next = `${prev.replace(/\s+$/, "")}\n${line}\n`;
      } else {
        next = `# Ingest Log — ${input.workspaceId}\n\n${line}\n`;
      }
      await atomicWrite(logAbs, next);
      filesForCommit[logRel] = next;
    }

    // Commit inside worktree.
    // LLM ingest commits use `jarvis-llm@{workspaceId}` as the author email
    // so boundary.ts and the CI workflow (wiki-boundary-check.yml) can
    // distinguish them from human-triggered commits (`wiki-bot@jarvis.internal`).
    const contentPageCount = subBlocks.filter((b) => !b.isBookkeeping).length;
    const author = {
      name: "jarvis-llm",
      email: `jarvis-llm@${input.workspaceId}`,
    };
    const commitInfo = await wtRepo.writeAndCommit({
      files: filesForCommit,
      message: `[ingest] ${input.sourceTitle} — ${contentPageCount} pages updated`,
      author,
    });

    // Fast-forward merge into main.
    const mainGit = mainRepo.raw();
    await mainGit.raw(["merge", "--ff-only", worktree.branch]);

    // ── DB projection (after main has the commit) ──
    // All DB writes that depend on the git commit go into a single
    // transaction so a projection failure cannot leave partial rows
    // referencing the merged commit. On tx failure we log + try to
    // record an `ingest_orphan` marker in wiki_commit_log so operators
    // can reconcile the git main ↔ DB mismatch.
    // Build contradiction signal set from Step B review blocks (type="contradiction")
    // so pages involved in contradictions stay draft until a human resolves them.
    const contradictionPaths = new Set<string>(
      input.reviewBlocks
        .filter((rb) => rb.type === "contradiction")
        .flatMap((rb) => rb.pages ?? [])
        .map((p) => p.replace(/^wiki\/[^/]+\//, "").replace(/^\/+/, "")),
    );

    let newCount = 0;
    let updatedCount = 0;
    try {
      const txResult = await db.transaction(async (tx) => {
        const pageResult = await projectPages({
          workspaceId: input.workspaceId,
          blocks: subBlocks,
          commitSha: commitInfo.sha,
          sourceSensitivity: input.sourceSensitivity,
          contradictionPaths,
          tx,
        });

        await projectLinks({
          workspaceId: input.workspaceId,
          blocks: subBlocks,
          pathToId: pageResult.pathToId,
          tx,
        });

        await tx.insert(wikiCommitLog).values({
          workspaceId: input.workspaceId,
          commitSha: commitInfo.sha,
          operation: "ingest",
          authorType: "llm",
          authorRef: `jarvis-llm@${input.workspaceId}`,
          affectedPages: Array.from(pageResult.pathToId.values()),
          reasoning: `ingest run=${input.runId} source=${input.rawSourceId} title=${input.sourceTitle}`,
          sourceRefId: input.rawSourceId,
        });

        return pageResult;
      });
      newCount = txResult.newCount;
      updatedCount = txResult.updatedCount;
    } catch (txErr) {
      const message = txErr instanceof Error ? txErr.message : String(txErr);
      console.error(
        `[ingest:writeAndCommit] DB projection FAILED after ff-merge ` +
          `(git/DB drift) rawSourceId=${input.rawSourceId} ` +
          `commit=${commitInfo.sha.slice(0, 8)} err=${message}`,
      );
      // Best-effort orphan marker — uses a separate connection since the
      // original tx is rolled back. Failures here are swallowed so the
      // original tx error still bubbles up.
      try {
        await db.insert(wikiCommitLog).values({
          workspaceId: input.workspaceId,
          commitSha: commitInfo.sha,
          operation: "ingest_orphan",
          authorType: "llm",
          authorRef: `jarvis-llm@${input.workspaceId}`,
          affectedPages: [],
          reasoning:
            `ingest run=${input.runId} source=${input.rawSourceId} ` +
            `title=${input.sourceTitle} — DB projection failed: ${message.slice(0, 500)}`,
          sourceRefId: input.rawSourceId,
        });
      } catch (markerErr) {
        console.error(
          `[ingest:writeAndCommit] failed to record ingest_orphan marker: ${String(markerErr)}`,
        );
      }
      throw txErr;
    }

    return {
      ok: true,
      commitSha: commitInfo.sha,
      affectedPaths: Object.keys(filesForCommit),
      failures: [],
      newPageCount: newCount,
      updatedPageCount: updatedCount,
      contentPageCount,
    };
  } finally {
    if (worktree) {
      await worktree.cleanup();
    }
  }
}
