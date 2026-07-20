import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  sourceRevision,
  wikiCommitLog,
  wikiPageIndex,
  wikiPageLink,
  wikiPageSourceRef,
} from "@jarvis/db";
import {
  type EvidenceSourceRef,
  isProjectableWikiPath,
  parseFrontmatter,
  parseWikilinks,
  type GitRepo,
  type WikiLink,
} from "@jarvis/wiki-fs";
import { type LockedDbExecutor, withWorkspaceSingleWriter } from "./single-writer.js";

export interface ProjectablePage {
  path: string;
  title: string;
  slug: string;
  zone: "auto" | "manual";
  pageType: "source" | "concept" | "case" | "guide" | "synthesis";
  publishedStatus: "draft" | "published" | "archived";
  freshnessSlaDays: number | null;
  frontmatter: Record<string, unknown>;
  snippet: string;
  sources: EvidenceSourceRef[];
  links: WikiLink[];
}

export class ProjectionContractError extends Error {
  constructor(message: string, readonly details: Record<string, unknown>) {
    super(message);
    this.name = "ProjectionContractError";
  }
}

export async function readProjectableSnapshot(
  repo: GitRepo,
  commitSha: string,
): Promise<ProjectablePage[]> {
  const paths = (await repo.listTreePaths(commitSha)).filter(isProjectableWikiPath).sort();
  const pages: ProjectablePage[] = [];
  const slugSet = new Set<string>();

  for (const path of paths) {
    const markdown = await repo.readBlob(commitSha, path);
    const { data, body } = parseFrontmatter(markdown);
    if (slugSet.has(data.slug)) {
      throw new ProjectionContractError("duplicate slug in wiki snapshot", {
        slug: data.slug,
        path,
      });
    }

    slugSet.add(data.slug);
    pages.push({
      path,
      title: data.title,
      slug: data.slug,
      zone: path.startsWith("manual/") ? "manual" : "auto",
      pageType: data.pageType,
      publishedStatus: data.publishedStatus,
      freshnessSlaDays: data.freshnessSlaDays ?? null,
      frontmatter: data as unknown as Record<string, unknown>,
      snippet: body.replace(/\s+/g, " ").trim().slice(0, 500),
      sources: data.sources,
      links: parseWikilinks(body),
    });
  }

  return pages;
}

export async function projectCurrentHead(input: {
  workspaceId: string;
  repo: GitRepo;
}): Promise<{ commitSha: string; paths: string[] }> {
  return withWorkspaceSingleWriter(input.workspaceId, async (tx) => projectCurrentHeadInTx(input, tx));
}

export async function projectCurrentHeadInTx(input: {
  workspaceId: string;
  repo: GitRepo;
}, tx: LockedDbExecutor): Promise<{ commitSha: string; paths: string[] }> {
    const commitSha = await input.repo.headSha();
    const pages = await readProjectableSnapshot(input.repo, commitSha);
    const commits = await input.repo.logAll();
    for (const page of pages) {
      if (page.zone === "auto" && page.sources.length === 0) {
        throw new ProjectionContractError("auto pages must cite at least one source revision", {
          path: page.path,
        });
      }
    }

    const referencedRevisionIds = [...new Set(pages.flatMap((page) => page.sources.map((source) => source.sourceRevisionId)))];
    const revisionById = new Map<string, { id: string; sourceDocumentId: string; retrievedAt: Date }>();
    if (referencedRevisionIds.length > 0) {
      const revisions = await tx
        .select({
          id: sourceRevision.id,
          sourceDocumentId: sourceRevision.sourceDocumentId,
          retrievedAt: sourceRevision.retrievedAt,
        })
        .from(sourceRevision)
        .where(and(eq(sourceRevision.workspaceId, input.workspaceId), inArray(sourceRevision.id, referencedRevisionIds)));
      for (const revision of revisions) revisionById.set(revision.id, revision);
    }
    const missingRevisionIds = referencedRevisionIds.filter((id) => !revisionById.has(id));
    if (missingRevisionIds.length > 0) {
      throw new ProjectionContractError("wiki page references missing source revisions", {
        sourceRevisionIds: missingRevisionIds,
      });
    }
    const allWorkspaceRevisions = await tx
      .select({
        id: sourceRevision.id,
        sourceDocumentId: sourceRevision.sourceDocumentId,
        retrievedAt: sourceRevision.retrievedAt,
      })
      .from(sourceRevision)
      .where(eq(sourceRevision.workspaceId, input.workspaceId));
    const revisionByWorkspaceId = new Map(allWorkspaceRevisions.map((revision) => [revision.id, revision]));
    const latestRevisionByDocument = new Map<string, { id: string; retrievedAt: Date }>();
    for (const revision of allWorkspaceRevisions) {
      const currentLatest = latestRevisionByDocument.get(revision.sourceDocumentId);
      if (
        !currentLatest ||
        revision.retrievedAt > currentLatest.retrievedAt ||
        (revision.retrievedAt.getTime() === currentLatest.retrievedAt.getTime() && revision.id > currentLatest.id)
      ) {
        latestRevisionByDocument.set(revision.sourceDocumentId, {
          id: revision.id,
          retrievedAt: revision.retrievedAt,
        });
      }
    }

    await tx.delete(wikiPageSourceRef).where(eq(wikiPageSourceRef.workspaceId, input.workspaceId));
    await tx.delete(wikiPageLink).where(eq(wikiPageLink.workspaceId, input.workspaceId));
    await tx.delete(wikiPageIndex).where(eq(wikiPageIndex.workspaceId, input.workspaceId));
    await tx.delete(wikiCommitLog).where(eq(wikiCommitLog.workspaceId, input.workspaceId));

    const pageRows = pages.map((page) => ({
      workspaceId: input.workspaceId,
      path: page.path,
      title: page.title,
      slug: page.slug,
      zone: page.zone,
      pageType: page.pageType,
      frontmatter: page.frontmatter,
      gitSha: commitSha,
      stale: page.sources.some((source) => {
        const revision = revisionById.get(source.sourceRevisionId);
        if (!revision) return true;
        return latestRevisionByDocument.get(revision.sourceDocumentId)?.id !== revision.id;
      }),
      publishedStatus: page.publishedStatus,
      freshnessSlaDays: page.freshnessSlaDays,
      snippet: page.snippet,
      updatedAt: new Date(),
    }));
    if (pageRows.length > 0) {
      await tx.insert(wikiPageIndex).values(pageRows);
    }

    const insertedPages = await tx
      .select({ id: wikiPageIndex.id, path: wikiPageIndex.path, slug: wikiPageIndex.slug })
      .from(wikiPageIndex)
      .where(eq(wikiPageIndex.workspaceId, input.workspaceId));
    const pageIdByPath = new Map(insertedPages.map((row) => [row.path, row.id]));
    const pageIdBySlug = new Map(insertedPages.map((row) => [row.slug, row.id]));
    const pagePathBySlug = new Map(insertedPages.map((row) => [row.slug, row.path]));

    const sourceRefRows = pages.flatMap((page) => {
      const pageId = pageIdByPath.get(page.path);
      if (!pageId) return [];
      const seen = new Set<string>();
      return page.sources.filter((source) => {
        const key = `${source.sourceRevisionId}\0${source.locator}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((source) => ({
        workspaceId: input.workspaceId,
        pageId,
        sourceRevisionId: source.sourceRevisionId,
        locator: source.locator,
        effectiveDate: source.effectiveDate,
        confidence: source.confidence.toFixed(3),
      }));
    });
    if (sourceRefRows.length > 0) {
      await tx.insert(wikiPageSourceRef).values(sourceRefRows);
    }

    const linkRows = pages.flatMap((page) => {
      const fromPageId = pageIdByPath.get(page.path);
      if (!fromPageId) return [];
      const seen = new Set<string>();
      return page.links.filter((link) => {
        const key = `${link.target}\0${link.alias ?? ""}\0${link.anchor ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((link) => {
        const targetPath = link.target.endsWith(".md") ? link.target : `${link.target}.md`;
        const toPageId = pageIdBySlug.get(link.target) ?? pageIdByPath.get(link.target) ?? pageIdByPath.get(targetPath) ?? null;
        const toPath = pagePathBySlug.get(link.target) ?? link.target;
        return {
          workspaceId: input.workspaceId,
          fromPageId,
          toPageId,
          toPath,
          alias: link.alias ?? null,
          anchor: link.anchor ?? null,
        };
      });
    });
    if (linkRows.length > 0) {
      await tx.insert(wikiPageLink).values(linkRows);
    }

    const commitRows = commits.map((commit) => ({
      workspaceId: input.workspaceId,
      commitSha: commit.sha,
      operation: inferOperation(commit.message),
      authorType: inferAuthorType(commit.author.email),
      authorRef: commit.author.email,
      affectedPages: commit.affectedPaths.filter(isProjectableWikiPath),
      reasoning: commit.message,
      sourceRevisionId: workspaceSourceRevisionId(commit.message, revisionByWorkspaceId),
    }));
    if (commitRows.length > 0) {
      await tx.insert(wikiCommitLog).values(commitRows);
    }

    return { commitSha, paths: pages.map((page) => page.path) };
}

function inferOperation(message: string): string {
  const raw = /^\[(.+?)\]/.exec(message)?.[1]?.trim().toLowerCase();
  if (raw === "ingest" || raw === "lint" || raw === "manual") return raw;
  if (message.includes("bootstrap")) return "bootstrap";
  return "manual";
}

function inferAuthorType(email: string): string {
  if (email === "wiki-bot@example.invalid") return "system";
  if (email.endsWith("@example.invalid")) return "llm";
  return "user";
}

function workspaceSourceRevisionId(
  message: string,
  revisionByWorkspaceId: ReadonlyMap<string, unknown>,
): string | null {
  const match = /source-revision:([0-9a-f-]{36})/i.exec(message);
  const candidate = match?.[1]?.toLowerCase();
  return candidate && revisionByWorkspaceId.has(candidate) ? candidate : null;
}
