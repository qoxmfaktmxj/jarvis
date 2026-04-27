import { db } from "@jarvis/db/client";
import {
  menuItem,
  wikiPageIndex
} from "@jarvis/db/schema";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql
} from "drizzle-orm";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";

export interface MenuItem {
  id: string;
  label: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
}

type StaleKnowledgePageRow = {
  id: string;
  title: string;
  publishStatus: string;
  freshnessSlaDays: number;
  lastVerifiedAt: Date | null;
  createdAt: Date;
};

export interface StalePage {
  id: string;
  path: string;
  slug: string;
  title: string;
  lastReviewedAt: Date;
  overdueDays: number;
}

type DashboardDb = typeof db;

export function getSearchPeriodStart(now: Date = new Date()): string {
  const current = new Date(now);
  const day = current.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + delta);
  current.setUTCHours(0, 0, 0, 0);
  return current.toISOString().slice(0, 10);
}

export function isKnowledgePageStale(
  page: StaleKnowledgePageRow,
  now: Date = new Date()
): boolean {
  if (page.publishStatus !== "published") {
    return false;
  }

  const lastReviewedAt = page.lastVerifiedAt ?? page.createdAt;
  const staleAfter = new Date(lastReviewedAt);
  staleAfter.setUTCDate(staleAfter.getUTCDate() + page.freshnessSlaDays);

  return staleAfter.getTime() < now.getTime();
}

export async function getQuickLinks(
  workspaceId: string,
  userRoles: string[],
  database: DashboardDb = db
): Promise<MenuItem[]> {
  const rows = await database
    .select({
      id: menuItem.id,
      label: menuItem.label,
      routePath: menuItem.routePath,
      icon: menuItem.icon,
      sortOrder: menuItem.sortOrder,
      requiredRole: menuItem.requiredRole,
      isVisible: menuItem.isVisible
    })
    .from(menuItem)
    .where(
      and(
        eq(menuItem.workspaceId, workspaceId),
        isNull(menuItem.parentId),
        eq(menuItem.isVisible, true)
      )
    )
    .orderBy(asc(menuItem.sortOrder));

  return rows
    .filter(
      (row) =>
        row.isVisible &&
        Boolean(row.routePath) &&
        (row.requiredRole == null || userRoles.includes(row.requiredRole))
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      path: row.routePath,
      icon: row.icon,
      sortOrder: row.sortOrder
    }))
    .slice(0, 8);
}

// Alias for spec compatibility
export const getQuickLinksWithRoleFilter = getQuickLinks;

export async function getStalePages(
  workspaceId: string,
  userPermissions: string[],
  now: Date = new Date(),
  database: DashboardDb = db
): Promise<StalePage[]> {
  const allowedSensitivities = getAllowedWikiSensitivityValues(userPermissions);
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
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      title: wikiPageIndex.title,
      updatedAt: wikiPageIndex.updatedAt,
      freshnessSlaDays: wikiPageIndex.freshnessSlaDays,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        isNotNull(wikiPageIndex.freshnessSlaDays),
        lt(
          wikiPageIndex.updatedAt,
          sql<Date>`(${now}::timestamptz - (${wikiPageIndex.freshnessSlaDays} * interval '1 day'))`
        ),
        eq(wikiPageIndex.publishedStatus, "published"),
        allowedSensitivities.length > 0
          ? inArray(wikiPageIndex.sensitivity, allowedSensitivities)
          : sql`FALSE`,
        requiredPermissionGate
      )
    )
    .orderBy(asc(wikiPageIndex.updatedAt))
    .limit(20);

  return rows.map((row) => {
    const freshnessSlaDays = row.freshnessSlaDays ?? 0;
    const deadlineMs =
      row.updatedAt.getTime() + freshnessSlaDays * 24 * 60 * 60 * 1000;
    const overdueDays = Math.max(
      0,
      Math.floor((now.getTime() - deadlineMs) / (24 * 60 * 60 * 1000))
    );
    return {
      id: row.id,
      path: row.path,
      slug: row.slug,
      title: row.title,
      lastReviewedAt: row.updatedAt,
      overdueDays,
    };
  });
}

export async function getDashboardData(
  workspaceId: string,
  _userId: string,
  userRoles: string[],
  userPermissions: string[],
  loaders: Partial<{
    getQuickLinks: typeof getQuickLinks;
    getStalePages: typeof getStalePages;
    getRecentActivity: (workspaceId: string) => Promise<unknown[]>;
    getMyTasks: (workspaceId: string, userId: string) => Promise<unknown[]>;
    getSearchTrends: (workspaceId: string) => Promise<unknown[]>;
  }> = {}
): Promise<{
  quickLinks: MenuItem[];
  stalePages: StalePage[];
  recentActivity: unknown[];
  myTasks: unknown[];
  searchTrends: unknown[];
}> {
  const resolvedGetQuickLinks = loaders.getQuickLinks ?? getQuickLinks;
  const resolvedGetStalePages = loaders.getStalePages ?? getStalePages;
  const resolvedGetRecentActivity = loaders.getRecentActivity ?? (async () => []);
  const resolvedGetMyTasks = loaders.getMyTasks ?? (async () => []);
  const resolvedGetSearchTrends = loaders.getSearchTrends ?? (async () => []);

  const [
    quickLinks,
    stalePages,
    recentActivity,
    myTasks,
    searchTrends
  ] = await Promise.all([
    resolvedGetQuickLinks(workspaceId, userRoles),
    resolvedGetStalePages(workspaceId, userPermissions),
    resolvedGetRecentActivity(workspaceId),
    resolvedGetMyTasks(workspaceId, _userId),
    resolvedGetSearchTrends(workspaceId)
  ]);

  return {
    quickLinks,
    stalePages,
    recentActivity,
    myTasks,
    searchTrends
  };
}
