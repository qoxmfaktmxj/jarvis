export interface EvidenceSourceRef {
  sourceRevisionId: string;
  locator: string;
  effectiveDate: string | null;
  confidence: number;
}

export type WikiPageType = "source" | "concept" | "case" | "guide" | "synthesis";
export type WikiPublishedStatus = "draft" | "published" | "archived";
export type WikiActor = "agent" | "human" | "system";

export interface WikiFrontmatter {
  title: string;
  slug: string;
  pageType: WikiPageType;
  publishedStatus: WikiPublishedStatus;
  sources: EvidenceSourceRef[];
  aliases: string[];
  tags: string[];
  created: string;
  updated: string;
  freshnessSlaDays?: number;
}

export interface WikiLink {
  target: string;
  alias?: string;
  anchor?: string;
  raw: string;
}

export interface CommitAuthor {
  name: string;
  email: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: CommitAuthor;
  timestamp: number;
  affectedPaths: string[];
}

export interface WriteOptions {
  mode?: number;
  encoding?: BufferEncoding;
}

export interface WriteAndCommitOptions {
  actor: WikiActor;
  files: Record<string, string>;
  message: string;
  author: CommitAuthor;
}

export interface TempWorktreeHandle {
  repo: import("./git.js").GitRepo;
  baseSha: string;
  worktreePath: string;
  cleanup: () => Promise<void>;
}
