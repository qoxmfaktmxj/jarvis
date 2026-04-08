import { db } from "@jarvis/db/client";
import {
  auditLog,
  attendance,
  knowledgePage,
  menuItem,
  popularSearch,
  project,
  projectTask
} from "@jarvis/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne
} from "drizzle-orm";

export interface MenuItem {
  id: string;
  label: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  createdAt: Date;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
}

export interface ProjectStats {
  total: number;
  byStatus: Record<string, number>;
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
  title: string;
  lastReviewedAt: Date;
  overdueDays: number;
}

export interface TrendItem {
  query: string;
  count: number;
}

export interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
}

export interface DashboardData {
  quickLinks: MenuItem[];
  recentActivity: AuditLogEntry[];
  myTasks: TaskSummary[];
  projectStats: ProjectStats;
  stalePages: StalePage[];
  searchTrends: TrendItem[];
  attendanceSummary: AttendanceSummary;
}

type DashboardDb = typeof db;

type ProjectStatusCount = {
  status: string | null;
  count: number | string;
};

type AttendanceStatusCount = {
  status: string | null;
  count: number | string;
};

export function buildProjectStats(rows: ProjectStatusCount[]): ProjectStats {
  const byStatus: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    const key = row.status ?? "unknown";
    const value = Number(row.count);
    byStatus[key] = value;
    total += value;
  }

  return { total, byStatus };
}

export function buildAttendanceSummary(
  rows: AttendanceStatusCount[]
): AttendanceSummary {
  const totals: Record<string, number> = {};
  let totalDays = 0;

  for (const row of rows) {
    const key = row.status ?? "unknown";
    const value = Number(row.count);
    totals[key] = value;
    totalDays += value;
  }

  return {
    totalDays,
    presentDays: totals["present"] ?? 0,
    lateDays: totals["late"] ?? 0,
    absentDays: totals["absent"] ?? 0
  };
}

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

export async function getRecentActivity(
  workspaceId: string,
  database: DashboardDb = db
): Promise<AuditLogEntry[]> {
  return database
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      userId: auditLog.userId,
      createdAt: auditLog.createdAt
    })
    .from(auditLog)
    .where(eq(auditLog.workspaceId, workspaceId))
    .orderBy(desc(auditLog.createdAt))
    .limit(10) as Promise<AuditLogEntry[]>;
}

export async function getMyTasks(
  workspaceId: string,
  userId: string,
  database: DashboardDb = db
): Promise<TaskSummary[]> {
  return database
    .select({
      id: projectTask.id,
      title: projectTask.title,
      status: projectTask.status,
      dueDate: projectTask.dueDate,
      projectId: projectTask.projectId
    })
    .from(projectTask)
    .where(
      and(
        eq(projectTask.workspaceId, workspaceId),
        eq(projectTask.assigneeId, userId),
        ne(projectTask.status, "done")
      )
    )
    .orderBy(asc(projectTask.dueDate))
    .limit(10) as Promise<TaskSummary[]>;
}

export async function getProjectStats(
  workspaceId: string,
  database: DashboardDb = db
): Promise<ProjectStats> {
  const rows = await database
    .select({
      status: project.status,
      count: count()
    })
    .from(project)
    .where(eq(project.workspaceId, workspaceId))
    .groupBy(project.status);

  return buildProjectStats(rows);
}

export async function getStalePages(
  workspaceId: string,
  now: Date = new Date(),
  database: DashboardDb = db
): Promise<StalePage[]> {
  const rows = await database
    .select({
      id: knowledgePage.id,
      title: knowledgePage.title,
      publishStatus: knowledgePage.publishStatus,
      freshnessSlaDays: knowledgePage.freshnessSlaDays,
      lastVerifiedAt: knowledgePage.lastVerifiedAt,
      createdAt: knowledgePage.createdAt
    })
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        eq(knowledgePage.publishStatus, "published")
      )
    )
    .orderBy(asc(knowledgePage.lastVerifiedAt))
    .limit(20);

  return rows
    .filter((row) => isKnowledgePageStale(row, now))
    .map((row) => {
      const lastReviewedAt = row.lastVerifiedAt ?? row.createdAt;
      const staleAfter = new Date(lastReviewedAt);
      staleAfter.setUTCDate(staleAfter.getUTCDate() + row.freshnessSlaDays);

      return {
        id: row.id,
        title: row.title,
        lastReviewedAt,
        overdueDays: Math.floor(
          (now.getTime() - staleAfter.getTime()) / (1000 * 60 * 60 * 24)
        )
      };
    });
}

export async function getSearchTrends(
  workspaceId: string,
  now: Date = new Date(),
  database: DashboardDb = db
): Promise<TrendItem[]> {
  const periodStart = getSearchPeriodStart(now);

  return database
    .select({
      query: popularSearch.query,
      count: popularSearch.count
    })
    .from(popularSearch)
    .where(
      and(
        eq(popularSearch.workspaceId, workspaceId),
        eq(popularSearch.period, periodStart)
      )
    )
    .orderBy(desc(popularSearch.count))
    .limit(10) as Promise<TrendItem[]>;
}

export async function getAttendanceSummary(
  workspaceId: string,
  userId: string,
  now: Date = new Date(),
  database: DashboardDb = db
): Promise<AttendanceSummary> {
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const endOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  );

  const rows = await database
    .select({
      status: attendance.status,
      count: count()
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, workspaceId),
        eq(attendance.userId, userId),
        gte(attendance.attendDate, startOfMonth.toISOString().slice(0, 10)),
        lte(attendance.attendDate, endOfMonth.toISOString().slice(0, 10))
      )
    )
    .groupBy(attendance.status);

  return buildAttendanceSummary(rows);
}

export type DashboardLoaders = {
  getQuickLinks: typeof getQuickLinks;
  getRecentActivity: typeof getRecentActivity;
  getMyTasks: typeof getMyTasks;
  getProjectStats: typeof getProjectStats;
  getStalePages: typeof getStalePages;
  getSearchTrends: typeof getSearchTrends;
  getAttendanceSummary: typeof getAttendanceSummary;
};

const dashboardLoaders: DashboardLoaders = {
  getQuickLinks,
  getRecentActivity,
  getMyTasks,
  getProjectStats,
  getStalePages,
  getSearchTrends,
  getAttendanceSummary
};

export async function getDashboardData(
  workspaceId: string,
  userId: string,
  userRoles: string[],
  loaders: Partial<DashboardLoaders> = {}
): Promise<DashboardData> {
  const api = { ...dashboardLoaders, ...loaders };

  const [
    quickLinks,
    recentActivity,
    myTasks,
    projectStats,
    stalePages,
    searchTrends,
    attendanceSummary
  ] = await Promise.all([
    api.getQuickLinks(workspaceId, userRoles),
    api.getRecentActivity(workspaceId),
    api.getMyTasks(workspaceId, userId),
    api.getProjectStats(workspaceId),
    api.getStalePages(workspaceId),
    api.getSearchTrends(workspaceId),
    api.getAttendanceSummary(workspaceId, userId)
  ]);

  return {
    quickLinks,
    recentActivity,
    myTasks,
    projectStats,
    stalePages,
    searchTrends,
    attendanceSummary
  };
}
