/**
 * Shared type definitions for the @jarvis/wiki-fs package.
 *
 * These mirror the frontmatter schema described in `WIKI-AGENTS.md` §2 and are
 * the SSoT for TypeScript call sites that work with wiki pages on disk.
 */

/**
 * Page type — used to decide which `auto/` subdirectory holds the page and
 * which ingest prompt path applies.
 *
 * `infra-runbook` is for companies-source-derived system runbooks under
 * `wiki/<ws>/auto/infra/`. Structure defined in the infra pipeline plan
 * (see legacy company-master export pipeline doc).
 */
export type WikiPageType =
  | "source"
  | "entity"
  | "concept"
  | "synthesis"
  | "derived"
  | "infra-runbook";

/**
 * Sensitivity classification. Must match the enum used in the DB schema
 * (`packages/db/schema/*` — sensitivityEnum). Values are compared with
 * `===` on disk so keep them upper-case as-is.
 */
export type WikiSensitivity =
  | "PUBLIC"
  | "INTERNAL"
  | "RESTRICTED"
  | "SECRET_REF_ONLY";

/**
 * Authority — `auto` is LLM-owned, `manual` is human-owned. Auto/manual
 * separation is enforced at the directory level: within each workspace
 * the `auto/` subtree is LLM-only while the `manual/` subtree is
 * human-only. Mirrored here so ingest can cross-check.
 */
export type WikiAuthority = "auto" | "manual";

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
  sensitivity: WikiSensitivity;
  requiredPermission: string;
  sources: string[];
  aliases: string[];
  tags: string[];
  created: string;
  updated: string;
  authority: WikiAuthority;
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
