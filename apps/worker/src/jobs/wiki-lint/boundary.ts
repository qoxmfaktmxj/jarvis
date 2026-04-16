/**
 * apps/worker/src/jobs/wiki-lint/boundary.ts
 *
 * Phase-W3 v4-W3-T1 — auto/manual boundary violation detector.
 *
 * Scans recent commits in a workspace repo and flags commits whose author
 * pattern disagrees with the wiki path they touched:
 *
 *   - LLM author (`jarvis-llm@{workspaceId}`) writing into `wiki/manual/**`
 *   - Human author (anything else) writing into `wiki/auto/**`
 *
 * Pure git log walk — no LLM call. Paired with the CI workflow at
 * `.github/workflows/wiki-boundary-check.yml` which enforces the same rule
 * at PR time; this module powers the admin dashboard for historical
 * visibility and feeds `wiki_review_queue` (kind='boundary_violation').
 *
 * Uses the shared `GitRepo` facade (`simple-git` under the hood) so we stay
 * consistent with the rest of the wiki pipeline — never import `simple-git`
 * directly from worker jobs.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { GitRepo } from "@jarvis/wiki-fs";

/** Prefix marking a commit as authored by the LLM (per WIKI-AGENTS §5). */
export const LLM_AUTHOR_PREFIX = "jarvis-llm@";

export type BoundaryViolationKind =
  | "llm_wrote_manual"
  | "human_wrote_auto";

export interface BoundaryViolation {
  /** Full 40-char SHA of the offending commit. */
  commitSha: string;
  /** Author email from `%ae` (e.g. `jarvis-llm@<wsId>` or a human email). */
  author: string;
  /** Repo-relative path that tripped the rule. */
  path: string;
  kind: BoundaryViolationKind;
  /** Commit timestamp (unix seconds) for UI sorting. */
  timestamp: number;
}

export interface DetectBoundaryViolationsOptions {
  /** Look-back window in days. Defaults to 7 (weekly lint cadence). */
  sinceDays?: number;
  /** Max commits to inspect. Defaults to 500 — plenty for a weekly scan. */
  maxCommits?: number;
}

/**
 * Walk recent commits in `repoPath` and return any boundary violations.
 *
 * The classifier is strict:
 *   - `author.startsWith('jarvis-llm@')` ⇒ LLM, else ⇒ human.
 *   - `path.startsWith('wiki/manual/')` ⇒ manual area
 *   - `path.startsWith('wiki/auto/')`   ⇒ auto area
 *
 * Paths that fall outside either area (e.g. `wiki/{ws}/_system/**` or
 * shared top-level files) are ignored — this check only polices the
 * auto/manual split itself.
 */
export async function detectBoundaryViolations(
  repoPath: string,
  opts: DetectBoundaryViolationsOptions = {},
): Promise<BoundaryViolation[]> {
  // Guard: if .git does not exist, the workspace repo has not been
  // bootstrapped yet. Return empty to avoid crashing the entire lint run.
  if (!existsSync(path.join(repoPath, ".git"))) {
    return [];
  }

  const sinceDays = opts.sinceDays ?? 7;
  const maxCommits = opts.maxCommits ?? 500;
  const sinceMs = Date.now() - sinceDays * 86400_000;

  const repo = new GitRepo(repoPath);
  const commits = await repo.log(maxCommits);
  const violations: BoundaryViolation[] = [];

  for (const commit of commits) {
    // Trim by time window — `GitRepo.log` returns most-recent-first so we
    // could early-exit, but being defensive keeps the code readable.
    if (commit.timestamp * 1000 < sinceMs) continue;

    const isLlm = commit.author.email.startsWith(LLM_AUTHOR_PREFIX);

    for (const rawPath of commit.affectedPaths) {
      // Normalize: strip backslashes, remove `wiki/{workspaceId}/` prefix
      // that may appear when git log returns monorepo-root-relative paths
      // instead of workspace-sub-repo-relative paths, and strip leading slash.
      const file = rawPath
        .replace(/\\/g, "/")
        .replace(/^wiki\/[^/]+\//, "")
        .replace(/^\//, "");

      if (isLlm && isManualPath(file)) {
        violations.push({
          commitSha: commit.sha,
          author: commit.author.email,
          path: file,
          kind: "llm_wrote_manual",
          timestamp: commit.timestamp,
        });
      } else if (!isLlm && isAutoPath(file)) {
        violations.push({
          commitSha: commit.sha,
          author: commit.author.email,
          path: file,
          kind: "human_wrote_auto",
          timestamp: commit.timestamp,
        });
      }
    }
  }

  return violations;
}

/**
 * Pure predicate — exported so tests can exercise without a repo.
 *
 * NOTE: paths are relative to the **workspace sub-repo root** (not the monorepo
 * root), so they begin with `auto/` — not `wiki/auto/`. The CI workflow
 * (`wiki-boundary-check.yml`) checks against the monorepo root and therefore
 * uses `wiki/auto/**`; boundary.ts operates inside an already-scoped repo and
 * must use the shorter prefix.
 */
export function isAutoPath(repoRelativePath: string): boolean {
  const p = repoRelativePath.replace(/\\/g, "/");
  return p.startsWith("auto/") || p === "auto";
}

/** Pure predicate — see `isAutoPath` for path-root context. */
export function isManualPath(repoRelativePath: string): boolean {
  const p = repoRelativePath.replace(/\\/g, "/");
  return p.startsWith("manual/") || p === "manual";
}
