/**
 * apps/worker/src/jobs/wiki-lint.ts
 *
 * Phase-W2 T3 — weekly wiki health-check cron (WIKI-AGENTS.md §3.3).
 *
 * Runs Sunday 03:00 KST (= Saturday 18:00 UTC = `0 18 * * 6`) behind
 * `FEATURE_WIKI_LINT_CRON`. Per workspace it runs five checks:
 *
 *   1. detectOrphans            — pages with no inbound wikilinks
 *   2. detectBrokenLinks        — unresolved `[[target]]` refs
 *   3. detectContradictions     — LLM semantic judge (only LLM check)
 *   4. detectStaleClaims        — page older than STALE_DAYS + newer raw_source
 *   5. suggestMissingCrossRefs  — no-outlink pages with related peers
 *
 * Side effects:
 *   - Each finding becomes a `wiki_review_queue` row (`kind='lint'`, subkind
 *     in `payload.subkind`). We never write into `wiki/auto/**` directly;
 *     admin approval is required.
 *   - A summary markdown is committed to `wiki/{ws}/_system/lint-report-
 *     {YYYY-MM-DD}.md` using `[lint]` commit prefix.
 *   - `wiki_lint_report` row records the aggregate counters.
 */

import type PgBoss from "pg-boss";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "@jarvis/db/client";
import { workspace } from "@jarvis/db/schema/tenant";
import { wikiLintReport } from "@jarvis/db/schema/wiki-lint-report";
import { wikiReviewQueue } from "@jarvis/db/schema/wiki-review-queue";
import { featureWikiLintCron } from "@jarvis/db/feature-flags";
import {
  GitRepo,
  defaultBotAuthor,
  exists,
  serializeFrontmatter,
  defaultFrontmatter,
} from "@jarvis/wiki-fs";

import { detectOrphans, type OrphanPage } from "./wiki-lint/orphans.js";
import {
  detectBrokenLinks,
  type BrokenLink,
} from "./wiki-lint/broken-links.js";
import {
  detectContradictions,
  type ContradictionFinding,
} from "./wiki-lint/contradictions.js";
import {
  detectStaleClaims,
  type StalePage,
} from "./wiki-lint/stale-claims.js";
import {
  suggestMissingCrossRefs,
  type MissingCrossRef,
} from "./wiki-lint/missing-cross-refs.js";

export const WIKI_LINT_QUEUE = "wiki-lint-weekly";
export const WIKI_LINT_CRON = "0 18 * * 6"; // Saturday 18:00 UTC = Sunday 03:00 KST

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT =
  process.env["WIKI_REPO_ROOT"] ?? path.resolve(__dirname, "../../../../");

export interface WikiLintWorkspaceResult {
  workspaceId: string;
  reportDate: string;
  orphanCount: number;
  brokenLinkCount: number;
  contradictionCount: number;
  staleCount: number;
  missingXrefCount: number;
  /** Total review_queue rows inserted (sum of five checks). */
  reviewQueueInserts: number;
  /** Lint report markdown repo-relative path. null if nothing written. */
  reportPath: string | null;
  /** Commit SHA when the report was committed. null on dry-run / skip. */
  commitSha: string | null;
}

export interface RunWikiLintOptions {
  /** When set, restrict the run to a single workspace (testing / manual). */
  workspaceIds?: string[];
  /** Skip git commit + review_queue insert; only compute counters. */
  dryRun?: boolean;
}

// ── pg-boss handler ──────────────────────────────────────────────────────

/**
 * pg-boss handler signature. We accept the job batch and run the
 * orchestrator once per schedule tick. Each workspace is processed
 * serially to keep LLM concurrency bounded.
 */
export async function wikiLintHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
): Promise<void> {
  if (!featureWikiLintCron()) {
    console.log("[wiki-lint] FEATURE_WIKI_LINT_CRON=false — skipping run");
    return;
  }
  const results = await runWikiLint({});
  console.log(
    `[wiki-lint] done — ${results.length} workspaces processed, ` +
      `${results.reduce((a, r) => a + r.reviewQueueInserts, 0)} review rows`,
  );
}

// ── orchestrator (exported for tests / manual invocation) ────────────────

export async function runWikiLint(
  opts: RunWikiLintOptions,
): Promise<WikiLintWorkspaceResult[]> {
  const workspaceIds = opts.workspaceIds ?? (await listAllWorkspaceIds());
  const results: WikiLintWorkspaceResult[] = [];

  for (const wsId of workspaceIds) {
    try {
      const r = await runWikiLintForWorkspace(wsId, opts);
      results.push(r);
    } catch (err) {
      console.error(`[wiki-lint] workspace=${wsId} failed: ${String(err)}`);
    }
  }
  return results;
}

async function runWikiLintForWorkspace(
  workspaceId: string,
  opts: RunWikiLintOptions,
): Promise<WikiLintWorkspaceResult> {
  const reportDate = formatDateUtc(new Date());
  console.log(
    `[wiki-lint] workspace=${workspaceId} date=${reportDate} start`,
  );

  // 1~5 checks (serial — keeps DB load and LLM RPS modest).
  const orphans = await detectOrphans(workspaceId);
  const brokenLinks = await detectBrokenLinks(workspaceId);
  const contradictions = await detectContradictions(workspaceId);
  const stale = await detectStaleClaims(workspaceId);
  const missingXrefs = await suggestMissingCrossRefs(workspaceId);

  let reviewQueueInserts = 0;
  let reportPath: string | null = null;
  let commitSha: string | null = null;

  if (!opts.dryRun) {
    reviewQueueInserts += await insertOrphanReviewItems(workspaceId, orphans);
    reviewQueueInserts += await insertBrokenLinkReviewItems(
      workspaceId,
      brokenLinks,
    );
    reviewQueueInserts += await insertContradictionReviewItems(
      workspaceId,
      contradictions,
    );
    reviewQueueInserts += await insertStaleReviewItems(workspaceId, stale);
    reviewQueueInserts += await insertMissingXrefReviewItems(
      workspaceId,
      missingXrefs,
    );

    const report = buildLintReportMarkdown({
      workspaceId,
      reportDate,
      orphans,
      brokenLinks,
      contradictions,
      stale,
      missingXrefs,
    });

    const written = await commitLintReport(
      workspaceId,
      reportDate,
      report,
      orphans.length +
        brokenLinks.length +
        contradictions.length +
        stale.length +
        missingXrefs.length,
    );
    reportPath = written.reportPath;
    commitSha = written.commitSha;

    await db.insert(wikiLintReport).values({
      workspaceId,
      reportDate,
      orphanCount: orphans.length,
      brokenLinkCount: brokenLinks.length,
      noOutlinkCount: missingXrefs.length,
      contradictionCount: contradictions.length,
      staleCount: stale.length,
      reportPath: reportPath,
    }).onConflictDoNothing();
  }

  return {
    workspaceId,
    reportDate,
    orphanCount: orphans.length,
    brokenLinkCount: brokenLinks.length,
    contradictionCount: contradictions.length,
    staleCount: stale.length,
    missingXrefCount: missingXrefs.length,
    reviewQueueInserts,
    reportPath,
    commitSha,
  };
}

// ── review_queue inserts ─────────────────────────────────────────────────

async function insertOrphanReviewItems(
  workspaceId: string,
  orphans: OrphanPage[],
): Promise<number> {
  if (orphans.length === 0) return 0;
  const rows = orphans.map((o) => ({
    workspaceId,
    kind: "lint",
    affectedPages: [o.pageId],
    description: `orphan page — no inbound wikilinks: ${o.title}`,
    payload: {
      subkind: "orphan" as const,
      path: o.path,
      title: o.title,
      slug: o.slug,
      type: o.type,
      updatedAt: o.updatedAt.toISOString(),
    },
    status: "pending",
  }));
  await db.insert(wikiReviewQueue).values(rows);
  return rows.length;
}

async function insertBrokenLinkReviewItems(
  workspaceId: string,
  items: BrokenLink[],
): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((b) => ({
    workspaceId,
    kind: "lint",
    affectedPages: [b.fromPageId],
    description: `broken link: [[${b.toPath}]] from ${b.fromPath}`,
    payload: {
      subkind: "broken_link" as const,
      fromPath: b.fromPath,
      toPath: b.toPath,
      alias: b.alias,
      anchor: b.anchor,
    },
    status: "pending",
  }));
  await db.insert(wikiReviewQueue).values(rows);
  return rows.length;
}

async function insertContradictionReviewItems(
  workspaceId: string,
  findings: ContradictionFinding[],
): Promise<number> {
  if (findings.length === 0) return 0;
  const rows = findings.map((c) => ({
    workspaceId,
    kind: "contradiction",
    affectedPages: [c.pageA.id, c.pageB.id],
    description: c.description.slice(0, 400),
    payload: {
      subkind: "contradiction" as const,
      pageA: { id: c.pageA.id, path: c.pageA.path, title: c.pageA.title },
      pageB: { id: c.pageB.id, path: c.pageB.path, title: c.pageB.title },
      confidence: c.confidence,
      source: "lint",
    },
    status: "pending",
  }));
  await db.insert(wikiReviewQueue).values(rows);
  return rows.length;
}

async function insertStaleReviewItems(
  workspaceId: string,
  items: StalePage[],
): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((s) => ({
    workspaceId,
    kind: "lint",
    affectedPages: [s.pageId],
    description: `stale claim — page older than newest raw_source: ${s.title}`,
    payload: {
      subkind: "stale" as const,
      path: s.path,
      title: s.title,
      slug: s.slug,
      pageUpdatedAt: s.pageUpdatedAt.toISOString(),
      latestSourceAt: s.latestSourceAt.toISOString(),
      rawSourceIds: s.rawSourceIds,
    },
    status: "pending",
  }));
  await db.insert(wikiReviewQueue).values(rows);
  return rows.length;
}

async function insertMissingXrefReviewItems(
  workspaceId: string,
  items: MissingCrossRef[],
): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((m) => ({
    workspaceId,
    kind: "lint",
    affectedPages: [m.fromPageId, m.toPageId],
    description: `missing cross-ref suggestion: ${m.fromTitle} → ${m.toTitle} (${m.reason})`,
    payload: {
      subkind: "missing_xref" as const,
      from: { id: m.fromPageId, path: m.fromPath, title: m.fromTitle },
      to: { id: m.toPageId, path: m.toPath, title: m.toTitle },
      reason: m.reason,
      score: m.score,
    },
    status: "pending",
  }));
  await db.insert(wikiReviewQueue).values(rows);
  return rows.length;
}

// ── report generation ────────────────────────────────────────────────────

interface ReportInput {
  workspaceId: string;
  reportDate: string;
  orphans: OrphanPage[];
  brokenLinks: BrokenLink[];
  contradictions: ContradictionFinding[];
  stale: StalePage[];
  missingXrefs: MissingCrossRef[];
}

export function buildLintReportMarkdown(r: ReportInput): string {
  const total =
    r.orphans.length +
    r.brokenLinks.length +
    r.contradictions.length +
    r.stale.length +
    r.missingXrefs.length;

  const now = new Date().toISOString();
  const fm = {
    ...defaultFrontmatter(),
    title: `Lint Report ${r.reportDate}`,
    type: "synthesis" as const,
    workspaceId: r.workspaceId,
    sensitivity: "INTERNAL" as const,
    requiredPermission: "knowledge:read",
    sources: [],
    aliases: [
      `린트 리포트 ${r.reportDate}`,
      `lint ${r.reportDate}`,
      `주간 점검 ${r.reportDate}`,
    ],
    tags: ["system/lint", "domain/quality"],
    created: now,
    updated: now,
    authority: "auto" as const,
    linkedPages: [],
  };

  const lines: string[] = [];
  lines.push(`# Lint Report ${r.reportDate}`);
  lines.push("");
  lines.push("## 요약");
  lines.push(`- 총 이슈: ${total}`);
  lines.push(
    `- orphan: ${r.orphans.length} / broken-link: ${r.brokenLinks.length} / ` +
      `contradictions: ${r.contradictions.length} / stale: ${r.stale.length} / ` +
      `missing-xref: ${r.missingXrefs.length}`,
  );
  lines.push("");

  if (r.orphans.length > 0) {
    lines.push("## Orphan Pages");
    for (const o of r.orphans) {
      lines.push(
        `- [[${o.slug}]] — ${o.type} — updated ${formatDateUtc(o.updatedAt)}`,
      );
    }
    lines.push("");
  }

  if (r.brokenLinks.length > 0) {
    lines.push("## Broken Links");
    for (const b of r.brokenLinks) {
      lines.push(`- \`${b.fromPath}\` → [[${b.toPath}]]`);
    }
    lines.push("");
  }

  if (r.contradictions.length > 0) {
    lines.push("## Contradictions (confidence ≥ 0.7)");
    for (const c of r.contradictions) {
      lines.push(
        `### [[${c.pageA.title}]] ↔ [[${c.pageB.title}]] (confidence ${c.confidence.toFixed(2)})`,
      );
      lines.push(`- ${c.description}`);
      lines.push("");
    }
  }

  if (r.stale.length > 0) {
    lines.push("## Stale Claims");
    for (const s of r.stale) {
      lines.push(
        `- [[${s.slug}]] — page ${formatDateUtc(s.pageUpdatedAt)} vs source ${formatDateUtc(s.latestSourceAt)}`,
      );
    }
    lines.push("");
  }

  if (r.missingXrefs.length > 0) {
    lines.push("## Missing Cross-refs");
    for (const m of r.missingXrefs) {
      lines.push(
        `- [[${m.fromTitle}]] ↔ [[${m.toTitle}]] — ${m.reason} (score ${m.score.toFixed(2)})`,
      );
    }
    lines.push("");
  }

  lines.push("## 다음 단계");
  lines.push(
    "- 각 이슈는 `wiki_review_queue`로 진입합니다. `/admin/wiki/review-queue`에서 승인/무시 가능.",
  );
  lines.push("");

  return serializeFrontmatter(fm, lines.join("\n"));
}

async function commitLintReport(
  workspaceId: string,
  reportDate: string,
  content: string,
  totalIssues: number,
): Promise<{ reportPath: string; commitSha: string }> {
  const repoRelPath = `wiki/${workspaceId}/_system/lint-report-${reportDate}.md`;
  const gitRepoPath = path.join(REPO_ROOT, "wiki", workspaceId);

  const hasGit = await exists(path.join(gitRepoPath, ".git"));
  if (!hasGit) {
    // Lint never initializes a repo — ingest/bootstrap owns repo creation.
    // If the repo is missing we still record counters in DB; skip commit.
    console.warn(
      `[wiki-lint] workspace=${workspaceId} has no git repo at ${gitRepoPath} — skipping commit`,
    );
    return { reportPath: repoRelPath, commitSha: "" };
  }

  const git = new GitRepo(gitRepoPath);
  const author = defaultBotAuthor();
  const message = `[lint] ${reportDate} — ${totalIssues} issues flagged`;

  // writeAndCommit expects paths relative to the repo root (the workspace
  // repo in our case), so we strip the `wiki/{ws}/` prefix.
  const fileKey = `_system/lint-report-${reportDate}.md`;
  const commitInfo = await git.writeAndCommit({
    files: { [fileKey]: content },
    message,
    author,
  });

  return { reportPath: repoRelPath, commitSha: commitInfo.sha };
}

// ── helpers ──────────────────────────────────────────────────────────────

async function listAllWorkspaceIds(): Promise<string[]> {
  const rows = await db.select({ id: workspace.id }).from(workspace);
  return rows.map((r) => r.id);
}

export function formatDateUtc(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
