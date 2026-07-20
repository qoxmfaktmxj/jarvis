export { GitRepo } from "./git.js";
export { createTempWorktree } from "./worktree.js";
export { readPage } from "./reader.js";
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
  normalizeRepoRelativePath,
  resolveContainedPath,
  assertWritableWikiPath,
  isProjectableWikiPath,
} from "./path-policy.js";
export type {
  EvidenceSourceRef,
  WikiFrontmatter,
  WikiPageType,
  WikiPublishedStatus,
  WikiActor,
  WikiLink,
  CommitAuthor,
  CommitInfo,
  TempWorktreeHandle,
  WriteAndCommitOptions,
} from "./types.js";
