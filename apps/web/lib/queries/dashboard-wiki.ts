import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

// NOTE: wiki-page-index has no authorId or tags columns.
// authorId/authorName are returned as fixed stubs; tags as empty array.
export interface DashboardWikiRow {
  id: string;
  title: string;
  path: string;
  slug: string;
  tags: string[];
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  sensitivity: string;
}

export function orderLatestWikiPages(
  rows: DashboardWikiRow[],
  limit = 10
): DashboardWikiRow[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function listLatestWikiPages(
  workspaceId: string,
  userPermissions: string[],
  limit = 10,
  database: typeof db = db
): Promise<DashboardWikiRow[]> {
  const allowed = getAllowedWikiSensitivityValues(userPermissions);
  if (allowed.length === 0) return [];

  const requiredPermissionGate = userPermissions.includes(PERMISSIONS.ADMIN_ALL)
    ? sql`TRUE`
    : userPermissions.length > 0
      ? or(
          isNull(wikiPageIndex.requiredPermission),
          inArray(wikiPageIndex.requiredPermission, userPermissions)
        )
      : isNull(wikiPageIndex.requiredPermission);

  const rows = await database
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      createdAt: wikiPageIndex.createdAt,
      updatedAt: wikiPageIndex.updatedAt,
      sensitivity: wikiPageIndex.sensitivity
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        inArray(wikiPageIndex.sensitivity, allowed),
        requiredPermissionGate
      )
    )
    .orderBy(desc(wikiPageIndex.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    tags: [],
    authorId: "",
    authorName: "—"
  }));
}
