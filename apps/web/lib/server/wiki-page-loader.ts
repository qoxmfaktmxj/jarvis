import "server-only";

import { and, asc, desc, eq, inArray, notInArray, notLike, sql } from "drizzle-orm";
import { db, sourceDocument, sourceRevision, wikiPageIndex, wikiPageSourceRef } from "@jarvis/db";
import { GitRepo, normalizeRepoRelativePath, parseFrontmatter } from "@jarvis/wiki-fs";

const EXCLUDED_ROOTS = new Set(["_system", "_archive"]);
const EXCLUDED_FILES = new Set(["auto/index.md", "auto/log.md", "manual/index.md", "manual/log.md"]);

export type WikiListItem = {
  id: string;
  title: string;
  slug: string;
  path: string;
  zone: "auto" | "manual";
  pageType: "source" | "concept" | "case" | "guide" | "synthesis";
  snippet: string;
  stale: boolean;
  updatedAt: Date;
};

export type WikiCitation = {
  sourceRevisionId: string;
  locator: string;
  effectiveFrom: string | null;
  title: string;
  canonicalUrl: string;
};

export type WikiPageListResult = {
  rows: WikiListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type WikiPageDetail = {
  id: string;
  title: string;
  path: string;
  slug: string;
  zone: "auto" | "manual";
  pageType: "source" | "concept" | "case" | "guide" | "synthesis";
  frontmatter: Record<string, unknown>;
  gitSha: string;
  snippet: string;
  stale: boolean;
  body: string;
  citations: WikiCitation[];
};

export function normalizeWikiRoutePath(segments: string[]): string {
  const candidate = normalizeRepoRelativePath(segments.join("/"));
  const root = candidate.split("/")[0] ?? "";
  if (candidate === "index" || candidate === "log" || EXCLUDED_ROOTS.has(root)) {
    throw new Error("WIKI_PAGE_NOT_FOUND");
  }
  const path = candidate.endsWith(".md") ? candidate : `${candidate}.md`;
  if (EXCLUDED_FILES.has(path)) {
    throw new Error("WIKI_PAGE_NOT_FOUND");
  }
  if (EXCLUDED_ROOTS.has(path.split("/")[1] ?? "")) {
    throw new Error("WIKI_PAGE_NOT_FOUND");
  }
  return path;
}

export function wikiPathToRoute(path: string): string {
  return `/wiki/${normalizeRepoRelativePath(path).replace(/\.md$/, "")}`;
}

function wikiPageListPredicate(workspaceId: string) {
  return and(
    eq(wikiPageIndex.workspaceId, workspaceId),
    inArray(wikiPageIndex.zone, ["auto", "manual"]),
    eq(wikiPageIndex.publishedStatus, "published"),
    notInArray(wikiPageIndex.path, Array.from(EXCLUDED_FILES)),
    notLike(wikiPageIndex.path, "auto/_system/%"),
    notLike(wikiPageIndex.path, "auto/_archive/%"),
    notLike(wikiPageIndex.path, "manual/_system/%"),
    notLike(wikiPageIndex.path, "manual/_archive/%"),
  );
}

export async function listWikiPages(input: {
  workspaceId: string;
  page: number;
  limit: number;
}): Promise<WikiPageListResult> {
  const limit = Math.max(1, Math.trunc(input.limit));
  const requestedPage = Number.isFinite(input.page) ? Math.max(1, Math.trunc(input.page)) : 1;
  const predicate = wikiPageListPredicate(input.workspaceId);
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiPageIndex)
    .where(predicate);
  const total = count?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const rows = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      path: wikiPageIndex.path,
      zone: wikiPageIndex.zone,
      pageType: wikiPageIndex.pageType,
      snippet: wikiPageIndex.snippet,
      stale: wikiPageIndex.stale,
      updatedAt: wikiPageIndex.updatedAt,
    })
    .from(wikiPageIndex)
    .where(predicate)
    .orderBy(asc(wikiPageIndex.zone), asc(wikiPageIndex.title))
    .limit(limit)
    .offset((page - 1) * limit);

  return { rows, total, page, totalPages };
}

export async function listRecentWikiPages(input: {
  workspaceId: string;
  limit: number;
}): Promise<WikiListItem[]> {
  const rows = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      path: wikiPageIndex.path,
      zone: wikiPageIndex.zone,
      pageType: wikiPageIndex.pageType,
      snippet: wikiPageIndex.snippet,
      stale: wikiPageIndex.stale,
      updatedAt: wikiPageIndex.updatedAt,
    })
    .from(wikiPageIndex)
    .where(wikiPageListPredicate(input.workspaceId))
    .orderBy(desc(wikiPageIndex.updatedAt), asc(wikiPageIndex.title))
    .limit(input.limit);

  return rows;
}

export async function loadWikiPage(input: {
  workspaceId: string;
  segments: string[];
  repo: Pick<GitRepo, "readBlob">;
}): Promise<WikiPageDetail> {
  return loadWikiPageByVisibility(input, false);
}

export async function loadPublishedWikiPage(input: {
  workspaceId: string;
  segments: string[];
  repo: Pick<GitRepo, "readBlob">;
}): Promise<WikiPageDetail> {
  return loadWikiPageByVisibility(input, true);
}

async function loadWikiPageByVisibility(
  input: {
    workspaceId: string;
    segments: string[];
    repo: Pick<GitRepo, "readBlob">;
  },
  publishedOnly: boolean,
): Promise<WikiPageDetail> {
  const path = normalizeWikiRoutePath(input.segments);
  const predicate = publishedOnly
    ? and(wikiPageListPredicate(input.workspaceId), eq(wikiPageIndex.path, path))
    : and(eq(wikiPageIndex.workspaceId, input.workspaceId), eq(wikiPageIndex.path, path));
  const [page] = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      zone: wikiPageIndex.zone,
      pageType: wikiPageIndex.pageType,
      frontmatter: wikiPageIndex.frontmatter,
      gitSha: wikiPageIndex.gitSha,
      snippet: wikiPageIndex.snippet,
      stale: wikiPageIndex.stale,
    })
    .from(wikiPageIndex)
    .where(predicate)
    .limit(1);
  if (!page) {
    throw new Error("WIKI_PAGE_NOT_FOUND");
  }

  const markdown = await input.repo.readBlob(page.gitSha, page.path);
  const parsed = parseFrontmatter(markdown);
  const citations = await db
    .select({
      sourceRevisionId: wikiPageSourceRef.sourceRevisionId,
      locator: wikiPageSourceRef.locator,
      effectiveFrom: wikiPageSourceRef.effectiveDate,
      title: sourceDocument.title,
      canonicalUrl: sourceDocument.canonicalUrl,
    })
    .from(wikiPageSourceRef)
    .innerJoin(sourceRevision, eq(sourceRevision.id, wikiPageSourceRef.sourceRevisionId))
    .innerJoin(sourceDocument, eq(sourceDocument.id, sourceRevision.sourceDocumentId))
    .where(eq(wikiPageSourceRef.pageId, page.id));

  return {
    ...page,
    body: parsed.body,
    citations: citations.map((citation) => ({
      ...citation,
      effectiveFrom: citation.effectiveFrom ? String(citation.effectiveFrom) : null,
    })),
  };
}
