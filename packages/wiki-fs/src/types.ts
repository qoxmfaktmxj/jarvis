/**
 * Shared type definitions for the @jarvis/wiki-fs package.
 *
 * These mirror the frontmatter schema described in `WIKI-AGENTS.md` §2 and are
 * the SSoT for TypeScript call sites that work with wiki pages on disk.
 */

/**
 * Page type — free-form string. Historically enumerated, now advisory only.
 *
 * Validation was removed in the 2026-05-17 frontmatter cleanup once the
 * disk corpus accumulated legacy values (`procedure`, `policy`, `reference`,
 * etc.) that ingest jobs had been emitting outside the original 6-member
 * enum. The DB column is `varchar(20)`, so any short string round-trips.
 */
export type WikiPageType = string;

/**
 * Sensitivity classification (legacy).
 *
 * Row-level sensitivity filtering was retired on 2026-05-12 in favor of
 * RBAC + workspaceId isolation. The DB column has been dropped. This type
 * is kept as `string` so existing callers (e.g. ingest substitution paths)
 * still compile while we burn down references.
 */
export type WikiSensitivity = string;

/**
 * Authority (legacy).
 *
 * Auto vs manual is enforced at the directory level (`auto/` vs `manual/`),
 * so the frontmatter field is redundant. Kept as `string` for compile-time
 * compatibility; runtime ignores it.
 */
export type WikiAuthority = string;

/**
 * Full frontmatter schema written into every wiki page's YAML block.
 *
 * Field order (for humans scanning): identity → taxonomy → provenance → time.
 * `aliases` is mandatory-with-minimum-3 from Step B (see WIKI-AGENTS §3.1).
 */
export interface WikiFrontmatter {
  title: string;
  type: WikiPageType;
  workspaceId: string;
  /** @deprecated Row-level sensitivity filter dropped 2026-05-12; field is advisory only. */
  sensitivity?: WikiSensitivity;
  /** @deprecated RBAC happens at the route level; this field is no longer enforced. */
  requiredPermission?: string;
  sources: string[];
  aliases: string[];
  tags: string[];
  created: string;
  updated: string;
  /** @deprecated Directory (`auto/` vs `manual/`) is authoritative; this field is redundant. */
  authority?: WikiAuthority;
  linkedPages: string[];
  freshnessSlaDays?: number;
  /**
   * Unknown passthrough fields — the parser keeps extra keys intact so
   * future schema extensions don't require a parser release.
   */
  [key: string]: unknown;
}

/**
 * Parsed `[[wikilink]]` reference.
 *
 * Supports the three forms described in `WIKI-AGENTS.md` §3.1 / the
 * reference_only/llm_wiki lint regex (L30~37):
 *  - `[[page]]`                → { target: "page" }
 *  - `[[page|label]]`          → { target: "page", alias: "label" }
 *  - `[[folder/page#anchor]]`  → { target: "folder/page", anchor: "anchor" }
 */
export interface WikiLink {
  target: string;
  alias?: string;
  anchor?: string;
  /** Original `[[...]]` literal as it appeared in the source. */
  raw: string;
}

/**
 * Author on a commit. `email` must pass simple-git's email validator — any
 * non-empty string is accepted but we keep the shape deliberately narrow so
 * DB projections (`wiki_commit_log.author`) don't need transformation.
 */
export interface CommitAuthor {
  name: string;
  email: string;
}

/**
 * Info about a committed revision. Shape mirrors `wiki_commit_log` DB
 * projection exactly so the integrator can insert rows without remapping.
 */
export interface CommitInfo {
  sha: string;
  message: string;
  author: CommitAuthor;
  /** Seconds since unix epoch — matches simple-git's `log` format. */
  timestamp: number;
  /** Repository-relative paths touched by this commit. */
  affectedPaths: string[];
}

/**
 * Supported commit message prefixes. Enforced by `GitRepo.writeAndCommit` —
 * see `WIKI-AGENTS.md` §5.
 */
export const COMMIT_PREFIXES = [
  "[ingest]",
  "[lint]",
  "[synthesis]",
  "[manual]",
] as const;
export type CommitPrefix = (typeof COMMIT_PREFIXES)[number];

/**
 * Options for `atomicWrite`. Default behavior: write to a `.tmp` sibling,
 * fsync it, rename over the target. Directories are created recursively.
 */
export interface WriteOptions {
  /**
   * File mode (default 0o644). Ignored on Windows (NTFS) — present for
   * parity with Linux CI.
   */
  mode?: number;
  /** Encoding for string payloads. Default "utf8". */
  encoding?: BufferEncoding;
}

/**
 * Options for `GitRepo.writeAndCommit`.
 *
 * `files` keys are **repository-relative** POSIX paths (always forward
 * slashes, regardless of OS). Values are the full file content — the writer
 * does a full overwrite, not a patch.
 */
export interface WriteAndCommitOptions {
  files: Record<string, string>;
  message: string;
  author: CommitAuthor;
}

/**
 * Handle returned by `createTempWorktree`. Callers **must** invoke
 * `cleanup()` in a `finally` block — the worktree holds a lock on the
 * parent repo until removed.
 */
export interface TempWorktreeHandle {
  worktreePath: string;
  branch: string;
  cleanup: () => Promise<void>;
}
