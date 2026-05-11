import { db } from "@jarvis/db/client";
import {
  wikiPageIndex
} from "@jarvis/db/schema";
import {
  and,
  asc,
  eq,
  isNotNull,
  lt,
  sql
} from "drizzle-orm";
import type { JarvisSession } from "@jarvis/auth/types";
import {
  getVisibleMenuTree,
  type MenuTreeNode
} from "@/lib/server/menu-tree";

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

/**
 * Returns the user's "quick menu" links for the profile page, sourced from the
 * same RBAC menu tree that powers the sidebar (`getVisibleMenuTree`).
 *
 * Historically this function did its own `menuItem.requiredRole` filter, which
 * diverged from the `menu_permission ⨯ role_permission ⨯ user_role` UNION model
 * used by the sidebar (see A10 audit F2). That allowed two failure modes:
 *  - sidebar shows a route that QuickMenu does not (and vice versa)
 *  - QuickMenu surfaces a link whose page redirects to `/dashboard?error=forbidden`
 *
 * Fix: delegate to `getVisibleMenuTree(session, "menu")` so both surfaces share
 * one permission decision. Then flatten leaf nodes (those with `routePath`),
 * sort by `sortOrder`, and cap the list.
 */
export async function getQuickLinks(
  session: JarvisSession,
  resolveMenuTree: (
    s: JarvisSession
  ) => Promise<MenuTreeNode[]> = (s) => getVisibleMenuTree(s, "menu")
): Promise<MenuItem[]> {
  const tree = await resolveMenuTree(session);
  const leaves = flattenLeafRoutes(tree);
  return leaves
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8)
    .map((node) => ({
      id: node.id,
      label: node.label,
      path: node.routePath,
      icon: node.icon,
      sortOrder: node.sortOrder
    }));
}

/**
 * Depth-first flatten of the menu tree to leaf nodes that have a non-empty
 * `routePath` (clickable links). Group headers (no routePath) are skipped but
 * their children are still traversed.
 */
function flattenLeafRoutes(
  nodes: MenuTreeNode[]
): Array<MenuTreeNode & { routePath: string }> {
  const result: Array<MenuTreeNode & { routePath: string }> = [];
  for (const node of nodes) {
    if (node.routePath && node.routePath.length > 0) {
      result.push({ ...node, routePath: node.routePath });
    }
    if (node.children.length > 0) {
      result.push(...flattenLeafRoutes(node.children));
    }
  }
  return result;
}

// Alias for spec compatibility
export const getQuickLinksWithRoleFilter = getQuickLinks;

export async function getStalePages(
  workspaceId: string,
  _userPermissions: string[],
  now: Date = new Date(),
  database: DashboardDb = db
): Promise<StalePage[]> {
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
        eq(wikiPageIndex.publishedStatus, "published")
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
  session: JarvisSession,
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
    resolvedGetQuickLinks(session),
    resolvedGetStalePages(session.workspaceId, session.permissions),
    resolvedGetRecentActivity(session.workspaceId),
    resolvedGetMyTasks(session.workspaceId, session.userId),
    resolvedGetSearchTrends(session.workspaceId)
  ]);

  return {
    quickLinks,
    stalePages,
    recentActivity,
    myTasks,
    searchTrends
  };
}
