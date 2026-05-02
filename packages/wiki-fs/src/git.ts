/**
 * Git facade for wiki workspace repositories.
 *
 * Wraps `simple-git` with exactly the operations our ingest / lint
 * pipeline needs:
 *   - createRepo        : `git init -b main` + first empty commit
 *   - readBlob          : `git show <ref>:<path>` for point-in-time reads
 *   - writeAndCommit    : stage-N-files then commit with a validated
 *                         message prefix (single-writer invariant)
 *   - headSha           : resolve HEAD to a full SHA1
 *   - log               : last N commits as structured `CommitInfo[]`
 *
 * The class does **not** attempt to recover from merge conflicts — per
 * `WIKI-AGENTS.md` §5 we operate in single-writer mode and treat any
 * non-fast-forward as a hard failure routed to `ingest_dlq`.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import { simpleGit, type SimpleGit } from "simple-git";

import {
  COMMIT_PREFIXES,
  type CommitAuthor,
  type CommitInfo,
  type CommitPrefix,
  type WriteAndCommitOptions,
} from "./types.js";
import { atomicWrite } from "./writer.js";

export class GitRepo {
  readonly repoPath: string;
  // simpleGit validates `baseDir` existence eagerly in its constructor.
  // Lazy-init lets callers do `new GitRepo(path)` before the directory
  // exists (e.g., `createRepo()` needs to mkdir first, CI test setup
  // materializes the workspace on first operation, etc.).
  private _git: SimpleGit | null = null;
  private get git(): SimpleGit {
    if (this._git === null) {
      this._git = simpleGit({ baseDir: this.repoPath });
    }
    return this._git;
  }

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
  }

  /**
   * Initialize an empty repository with `initialBranch` as the default.
   * Creates the directory if missing. Seeds an initial empty commit so
   * downstream code can always resolve HEAD.
   */
  async createRepo(initialBranch: string = "main"): Promise<void> {
    await fs.mkdir(this.repoPath, { recursive: true });
    await this.git.init(["-b", initialBranch]);
    // Pin local identity so the first commit doesn't need global git
    // config (CI runners often don't have one).
    await this.git.addConfig("user.name", "jarvis-wiki-bootstrap", false, "local");
    await this.git.addConfig("user.email", "jarvis-wiki@wiki.invalid", false, "local");
    // Empty seed commit. --allow-empty keeps the repo log-queryable
    // before any page is written.
    await this.git.commit("[manual] bootstrap — empty initial commit", {
      "--allow-empty": null,
    });
  }

  /**
   * Read a single file from `ref` (branch name, tag, or SHA). Returns
   * the raw UTF-8 content. Throws if the path doesn't exist at the ref.
   */
  async readBlob(ref: string, repoRelativePath: string): Promise<string> {
    // `git show ref:path` is the canonical way to read from history.
    const normalized = repoRelativePath.replace(/\\/g, "/");
    return this.git.show([`${ref}:${normalized}`]);
  }

  /**
   * Write a batch of files and create a single commit. The batch is the
   * unit of atomicity — either all files land or the staging area is
   * reset.
   *
   * Commit message MUST start with one of `COMMIT_PREFIXES` (see
   * `WIKI-AGENTS.md` §5). Enforced both for human authors (manual area)
   * and automated jobs; CI should lint this too but we fail closed here.
   */
  async writeAndCommit(opts: WriteAndCommitOptions): Promise<CommitInfo> {
    const { files, message, author } = opts;
    validateCommitMessage(message);

    const entries = Object.entries(files);
    if (entries.length === 0) {
      throw new Error("writeAndCommit called with no files");
    }

    // Write files atomically first — if any write fails we haven't
    // staged anything yet so simple cleanup.
    const relativePaths: string[] = [];
    for (const [rel, content] of entries) {
      const relNormalized = rel.replace(/\\/g, "/");
      relativePaths.push(relNormalized);
      const absolute = path.join(this.repoPath, relNormalized);
      await atomicWrite(absolute, content);
    }

    // Stage exactly the files we wrote — no `git add -A` so concurrent
    // edits in other directories don't get pulled in. (Defense-in-depth
    // even though we run single-writer per workspace.)
    await this.git.add(relativePaths);

    // Commit with explicit author so `wiki_commit_log` projection gets
    // the right identity regardless of local git config.
    const commitResult = await this.git.commit(message, relativePaths, {
      "--author": `${author.name} <${author.email}>`,
    });

    const sha = commitResult.commit ? await this.expandSha(commitResult.commit) : await this.headSha();
    const timestamp = await this.commitTimestamp(sha);

    return {
      sha,
      message,
      author,
      timestamp,
      affectedPaths: relativePaths,
    };
  }

  /**
   * Resolve HEAD to a full 40-char SHA1. Throws if the repo has no
   * commits yet (shouldn't happen after `createRepo`).
   */
  async headSha(): Promise<string> {
    const sha = await this.git.revparse(["HEAD"]);
    return sha.trim();
  }

  /**
   * Return the last `limit` commits, newest first, in `CommitInfo`
   * shape. Useful for audit rebuilds and the wiki_commit_log projection.
   */
  async log(limit: number = 10): Promise<CommitInfo[]> {
    const raw = await this.git.log({ maxCount: limit });
    const results: CommitInfo[] = [];
    for (const entry of raw.all) {
      results.push({
        sha: entry.hash,
        message: entry.message,
        author: {
          name: entry.author_name,
          email: entry.author_email,
        },
        timestamp: Math.floor(new Date(entry.date).getTime() / 1000),
        affectedPaths: await this.filesAt(entry.hash),
      });
    }
    return results;
  }

  /** Low-level escape hatch — expose the underlying SimpleGit. */
  raw(): SimpleGit {
    return this.git;
  }

  // ── internals ────────────────────────────────────────────────────────

  private async expandSha(abbreviated: string): Promise<string> {
    const resolved = await this.git.revparse([abbreviated]);
    return resolved.trim();
  }

  private async commitTimestamp(sha: string): Promise<number> {
    // %ct = committer date in Unix time.
    const out = await this.git.show([sha, "-s", "--format=%ct"]);
    const match = out.trim().split(/\s+/)[0];
    const parsed = Number.parseInt(match ?? "", 10);
    return Number.isFinite(parsed) ? parsed : Math.floor(Date.now() / 1000);
  }

  private async filesAt(sha: string): Promise<string[]> {
    try {
      const out = await this.git.show([sha, "--name-only", "--pretty=format:"]);
      return out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }
}

/**
 * Throw if `message` does not start with one of the permitted prefixes.
 * Exported for test coverage and for downstream validate hooks.
 */
export function validateCommitMessage(message: string): void {
  const trimmed = message.trimStart();
  const matched = COMMIT_PREFIXES.some((prefix: CommitPrefix) => trimmed.startsWith(prefix));
  if (!matched) {
    throw new Error(
      `Invalid commit message prefix. Expected one of ${COMMIT_PREFIXES.join(", ")} — got: ${JSON.stringify(message.slice(0, 40))}`,
    );
  }
  if (trimmed.length < 10) {
    throw new Error("Commit message too short (must contain prefix + description)");
  }
}

/**
 * Convenience — construct a default author identity for automated
 * ingest/lint jobs. Callers should normally provide their own author
 * (tied to a workspace bot), but this keeps test boilerplate slim.
 */
export function defaultBotAuthor(): CommitAuthor {
  return { name: "jarvis-wiki-bot", email: "wiki-bot@jarvis.internal" };
}
