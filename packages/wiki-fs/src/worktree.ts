/**
 * Temporary worktree lifecycle helpers.
 *
 * Ingest's Step C (`WIKI-AGENTS.md` §3.1) builds a patch in an isolated
 * worktree so validation can fail cleanly without polluting `main`. We
 * wrap `git worktree add/remove` so the worker never has to assemble the
 * CLI incantation manually.
 *
 * Callers MUST invoke `handle.cleanup()` in a `finally` — a dangling
 * worktree keeps a lockfile in the parent repo's `.git/worktrees/`
 * directory and subsequent `createTempWorktree` calls with the same
 * branch name will fail.
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { simpleGit } from "simple-git";

import type { GitRepo } from "./git.js";
import type { TempWorktreeHandle } from "./types.js";

export interface CreateTempWorktreeOptions {
  /**
   * Base ref to check out inside the worktree. Defaults to the current
   * HEAD of the parent repo. Can be a branch name, tag, or SHA.
   */
  baseRef?: string;
  /**
   * Branch name to create inside the worktree. Defaults to
   * `wiki-ingest-<timestamp>-<rand>` to avoid collisions when multiple
   * ingests run back-to-back.
   */
  branch?: string;
  /**
   * Parent directory for the worktree. Defaults to the OS temp dir.
   * Exposed for tests so they can place worktrees under a controlled
   * path for cleanup assertions.
   */
  parentDir?: string;
}

/**
 * Create a new ephemeral worktree rooted at a temp directory.
 *
 * Returns a handle with a `cleanup()` method that removes the worktree
 * (via `git worktree remove --force`), deletes the directory, and best-
 * effort removes the branch.
 */
export async function createTempWorktree(
  repo: GitRepo,
  options: CreateTempWorktreeOptions = {},
): Promise<TempWorktreeHandle> {
  const {
    baseRef,
    branch = defaultBranchName(),
    parentDir = os.tmpdir(),
  } = options;

  const worktreePath = path.join(parentDir, `jarvis-wiki-wt-${uniqueSuffix()}`);
  await fs.mkdir(parentDir, { recursive: true });

  const git = repo.raw();
  const args = ["add", worktreePath, "-b", branch];
  if (baseRef) args.push(baseRef);
  await git.raw(["worktree", ...args]);

  const cleanup = async (): Promise<void> => {
    // `git worktree remove` handles both the worktree dir and the
    // administrative entry under `.git/worktrees/`. `--force` because
    // we may have uncommitted debris from a failed validate.
    try {
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
    } catch {
      // If git bookkeeping is already out-of-sync, fall back to manual
      // directory removal so repeat runs aren't blocked.
    }
    // Directory may still exist if `git worktree remove` failed; nuke
    // it either way.
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => undefined);
    // Best-effort branch delete — ignore failures because the branch
    // might already be reaped by `git worktree remove`.
    try {
      await git.branch(["-D", branch]);
    } catch {
      // ignore
    }
  };

  return { worktreePath, branch, cleanup };
}

/**
 * Convenience — open a GitRepo-compatible view inside an existing
 * worktree. Useful when integrators already held a `TempWorktreeHandle`
 * and want to perform reads/writes without re-importing `simpleGit`.
 */
export function openWorktree(worktreePath: string) {
  return simpleGit({ baseDir: path.resolve(worktreePath) });
}

// ── internals ──────────────────────────────────────────────────────────

function defaultBranchName(): string {
  return `wiki-ingest-${uniqueSuffix()}`;
}

function uniqueSuffix(): string {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now}-${rand}`;
}
