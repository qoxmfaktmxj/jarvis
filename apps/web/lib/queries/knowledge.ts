import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { user } from '@jarvis/db/schema/user';
import { and, desc, eq, ilike, count } from 'drizzle-orm';

export type KnowledgePage = typeof knowledgePage.$inferSelect;
export type KnowledgePageVersion = typeof knowledgePageVersion.$inferSelect;

export type KnowledgePageWithVersion = KnowledgePage & {
  currentVersion: KnowledgePageVersion | null;
};

export type PageVersion = Pick<
  KnowledgePageVersion,
  'id' | 'versionNumber' | 'changeNote' | 'createdAt' | 'authorId'
> & {
  authorName: string | null;
  authorEmail: string | null;
};

export interface KnowledgeFilters {
  pageType?: string;
  publishStatus?: string;
  sensitivity?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface KnowledgePaginatedResponse {
  data: KnowledgePage[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getKnowledgePages(
  workspaceId: string,
  filters: KnowledgeFilters = {},
): Promise<KnowledgePaginatedResponse> {
  const { pageType, publishStatus, sensitivity, q, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(knowledgePage.workspaceId, workspaceId)];
  if (pageType) conditions.push(eq(knowledgePage.pageType, pageType));
  if (publishStatus) conditions.push(eq(knowledgePage.publishStatus, publishStatus));
  if (sensitivity) conditions.push(eq(knowledgePage.sensitivity, sensitivity));
  if (q) conditions.push(ilike(knowledgePage.title, `%${q}%`));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db.select().from(knowledgePage).where(where).orderBy(desc(knowledgePage.updatedAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(knowledgePage).where(where),
  ]);

  const total = Number(totalRows[0]?.total ?? 0);

  return {
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getKnowledgePage(
  pageId: string,
  workspaceId: string,
): Promise<KnowledgePageWithVersion | null> {
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  if (!page) return null;

  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  return { ...page, currentVersion: version ?? null };
}

export async function getPageVersions(pageId: string, workspaceId: string): Promise<PageVersion[]> {
  // Verify page belongs to workspace first
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  if (!page) return [];

  return db
    .select({
      id: knowledgePageVersion.id,
      versionNumber: knowledgePageVersion.versionNumber,
      changeNote: knowledgePageVersion.changeNote,
      createdAt: knowledgePageVersion.createdAt,
      authorId: knowledgePageVersion.authorId,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(knowledgePageVersion)
    .leftJoin(user, eq(knowledgePageVersion.authorId, user.id))
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber));
}

export async function getPagesByType(
  workspaceId: string,
  pageType: string,
  limit = 10,
): Promise<KnowledgePage[]> {
  return db
    .select()
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        eq(knowledgePage.pageType, pageType),
        eq(knowledgePage.publishStatus, 'published'),
      ),
    )
    .orderBy(desc(knowledgePage.updatedAt))
    .limit(limit);
}

export async function getVersionContent(
  versionId: string,
  workspaceId: string,
): Promise<KnowledgePageVersion | null> {
  const [version] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.id, versionId))
    .limit(1);

  if (!version) return null;

  // Ensure the parent page belongs to this workspace
  const [page] = await db
    .select({ id: knowledgePage.id })
    .from(knowledgePage)
    .where(and(eq(knowledgePage.id, version.pageId), eq(knowledgePage.workspaceId, workspaceId)))
    .limit(1);

  return page ? version : null;
}
