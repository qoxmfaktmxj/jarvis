import "server-only";

import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
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

export async function listWikiPages(input: { workspaceId: string }): Promise<WikiListItem[]> {
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
    .where(
      and(
        eq(wikiPageIndex.workspaceId, input.workspaceId),
        inArray(wikiPageIndex.zone, ["auto", "manual"]),
        eq(wikiPageIndex.publishedStatus, "published"),
        notInArray(wikiPageIndex.path, Array.from(EXCLUDED_FILES)),
      ),
    )
    .orderBy(asc(wikiPageIndex.zone), asc(wikiPageIndex.title));

  return rows.filter((row) => !EXCLUDED_ROOTS.has(row.path.split("/")[1] ?? ""));
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
    .where(
      and(
        eq(wikiPageIndex.workspaceId, input.workspaceId),
        inArray(wikiPageIndex.zone, ["auto", "manual"]),
        eq(wikiPageIndex.publishedStatus, "published"),
        notInArray(wikiPageIndex.path, Array.from(EXCLUDED_FILES)),
      ),
    )
    .orderBy(desc(wikiPageIndex.updatedAt), asc(wikiPageIndex.title))
    .limit(input.limit);

  return rows.filter((row) => !EXCLUDED_ROOTS.has(row.path.split("/")[1] ?? ""));
}

export async function loadWikiPage(input: {
  workspaceId: string;
  segments: string[];
  repo: Pick<GitRepo, "readBlob">;
}): Promise<WikiPageDetail> {
  const path = normalizeWikiRoutePath(input.segments);
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
    .where(and(eq(wikiPageIndex.workspaceId, input.workspaceId), eq(wikiPageIndex.path, path)))
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
