/**
 * Public API for `@jarvis/wiki-fs`.
 *
 * Keep this file import-light — downstream packages (apps/worker,
 * packages/wiki-agent) type-check against these re-exports, so adding a
 * heavy transitive load here ripples into dev-server startup.
 */

export {
  atomicWrite,
  readUtf8,
  exists,
} from "./writer.js";

export {
  parseFrontmatter,
  serializeFrontmatter,
  splitFrontmatter,
  defaultFrontmatter,
} from "./frontmatter.js";

export {
  parseWikilinks,
  parseWikilink,
  renderWikilinks,
  formatWikilink,
} from "./wikilink.js";

export {
  GitRepo,
  validateCommitMessage,
  defaultBotAuthor,
} from "./git.js";

export {
  createTempWorktree,
  openWorktree,
} from "./worktree.js";

export type {
  WikiPageType,
  WikiSensitivity,
  WikiAuthority,
  WikiFrontmatter,
  WikiLink,
  CommitAuthor,
  CommitInfo,
  CommitPrefix,
  WriteOptions,
  WriteAndCommitOptions,
  TempWorktreeHandle,
} from "./types.js";

export { COMMIT_PREFIXES } from "./types.js";
