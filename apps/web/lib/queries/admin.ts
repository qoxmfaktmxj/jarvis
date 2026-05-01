import { db } from '@jarvis/db/client';
import {
  user, organization, userRole, role, permission,
  menuItem, menuPermission, codeGroup, codeItem,
  auditLog, searchLog, popularSearch,
} from '@jarvis/db/schema';
import { and, eq, asc, desc, count, gte, lte, sql, inArray } from 'drizzle-orm';
import type { PaginatedResponse } from '@jarvis/shared/types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'inactive' | 'locked';

export type UserWithOrg = {
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  status: UserStatus;
  position: string | null;
  jobTitle: string | null;
  isOutsourced: boolean;
  createdAt: Date;
  orgId: string | null;
  orgName: string | null;
  roles: string[];
};

export type OrgNode = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: OrgNode[];
};

export type CodeGroup = {
  id: string;
  code: string;
  name: string;
  items: Array<{
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  employeeId: string | null;
};

export type SearchAnalytics = {
  totalToday: number;
  zeroResultRate: number;
  avgResponseMs: number;
  popularTerms: Array<{ term: string; count: number }>;
  zeroResultTerms: Array<{ term: string; count: number }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

// ── Users ─────────────────────────────────────────────────────────────────────

export type UserFilters = {
  q?: string;
  orgId?: string;
  status?: UserStatus | 'all';
  page?: number;
  limit?: number;
};

export async function getUsers(
  workspaceId: string,
  filters: UserFilters = {},
): Promise<PaginatedResponse<UserWithOrg>> {
  const { q, orgId, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(user.workspaceId, workspaceId)];
  if (q) {
    const escaped = escapeLike(q);
    conditions.push(
      sql`(${user.name} ilike ${`%${escaped}%`} or ${user.employeeId} ilike ${`%${escaped}%`} or ${user.email} ilike ${`%${escaped}%`})`,
    );
  }
  if (orgId !== undefined) conditions.push(eq(user.orgId, orgId));
  if (status && status !== 'all') conditions.push(eq(user.status, status));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:           user.id,
        employeeId:   user.employeeId,
        name:         user.name,
        email:        user.email,
        status:       user.status,
        position:     user.position,
        jobTitle:     user.jobTitle,
        isOutsourced: user.isOutsourced,
        createdAt:    user.createdAt,
        orgId:        user.orgId,
        orgName:      organization.name,
        roles:        sql<string[]>`
          coalesce(array_agg(${role.code}) filter (where ${role.code} is not null), '{}')
        `,
      })
      .from(user)
      .leftJoin(organization, eq(user.orgId, organization.id))
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(role, eq(role.id, userRole.roleId))
      .where(where)
      .groupBy(user.id, organization.id)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(user).where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return {
    data: rows as UserWithOrg[],
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}

// ── Organizations ─────────────────────────────────────────────────────────────

function buildOrgTree(rows: OrgNode[], parentId: string | null = null): OrgNode[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({ ...r, children: buildOrgTree(rows, r.id) }));
}

export async function getOrgTree(workspaceId: string): Promise<OrgNode[]> {
  const rows = await db
    .select({
      id:        organization.id,
      code:      organization.code,
      name:      organization.name,
      parentId:  organization.parentId,
      sortOrder: organization.sortOrder,
    })
    .from(organization)
    .where(eq(organization.workspaceId, workspaceId))
    .orderBy(asc(organization.sortOrder));

  return buildOrgTree(rows.map((r) => ({ ...r, children: [] })));
}

// ── Menus ─────────────────────────────────────────────────────────────────────

/**
 * Admin variant: returns ALL `menu_item` rows in the workspace, with no
 * permission filter, each annotated with the `permissions` that gate it
 * (joined via `menu_permission`). Used by `(app)/admin/menus/page.tsx` so
 * administrators can inspect "which menus require which permissions" — the
 * RBAC-relevant question the architecture review (Task 6 finding #11) flagged
 * as missing from the original viewer.
 *
 * **For the user-facing sidebar / CommandPalette use the RBAC-filtered
 * `getVisibleMenuTree(session, kind)` at `apps/web/lib/server/menu-tree.ts`
 * instead.** Two functions, opposite security postures: this one is admin-
 * gated by the calling page; the other is the runtime filter every signed-in
 * user gets.
 *
 * Two round trips (items + permission links) merged in JS — chosen over
 * `array_agg` for readability; menu_item count per workspace is small (~31).
 * Permissions are sorted by (resource, action) so badge render order is
 * deterministic for tests.
 */
export async function getMenuTree(workspaceId: string) {
  const [items, links] = await Promise.all([
    db
      .select()
      .from(menuItem)
      .where(eq(menuItem.workspaceId, workspaceId))
      .orderBy(asc(menuItem.sortOrder)),
    db
      .select({
        menuItemId: menuPermission.menuItemId,
        resource: permission.resource,
        action: permission.action,
      })
      .from(menuPermission)
      .innerJoin(permission, eq(permission.id, menuPermission.permissionId))
      .innerJoin(menuItem, eq(menuItem.id, menuPermission.menuItemId))
      .where(eq(menuItem.workspaceId, workspaceId)),
  ]);

  const byItem = new Map<string, Array<{ resource: string; action: string }>>();
  for (const link of links) {
    const arr = byItem.get(link.menuItemId) ?? [];
    arr.push({ resource: link.resource, action: link.action });
    byItem.set(link.menuItemId, arr);
  }
  for (const arr of byItem.values()) {
    arr.sort((a, b) =>
      a.resource === b.resource
        ? a.action.localeCompare(b.action)
        : a.resource.localeCompare(b.resource),
    );
  }

  return items.map((item) => ({
    ...item,
    permissions: byItem.get(item.id) ?? [],
  }));
}

// ── Codes ─────────────────────────────────────────────────────────────────────

export async function getCodeGroups(workspaceId: string): Promise<CodeGroup[]> {
  const groups = await db
    .select()
    .from(codeGroup)
    .where(eq(codeGroup.workspaceId, workspaceId))
    .orderBy(asc(codeGroup.code));

  const groupIds = groups.map((g) => g.id);
  const items = groupIds.length > 0
    ? await db
        .select()
        .from(codeItem)
        .where(inArray(codeItem.groupId, groupIds))
        .orderBy(asc(codeItem.sortOrder))
    : [];

  return groups.map((g) => ({
    ...g,
    items: items.filter((i) => i.groupId === g.id),
  })) as CodeGroup[];
}

export type CodeOption = { code: string; label: string };

export async function getCodesByGroup(
  workspaceId: string,
  groupCode: 'POSITION' | 'JOB_TITLE',
): Promise<CodeOption[]> {
  const rows = await db
    .select({
      code: codeItem.code,
      label: codeItem.name,
      sortOrder: codeItem.sortOrder,
    })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(
      eq(codeGroup.workspaceId, workspaceId),
      eq(codeGroup.code, groupCode),
      eq(codeItem.isActive, true),
    ))
    .orderBy(asc(codeItem.sortOrder));

  return rows.map((r) => ({ code: r.code, label: r.label }));
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export type AuditFilters = {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

export async function getAuditLogs(
  workspaceId: string,
  filters: AuditFilters = {},
): Promise<PaginatedResponse<AuditLogEntry>> {
  const { userId, action, resourceType, dateFrom, dateTo, page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(auditLog.workspaceId, workspaceId)];
  if (userId)       conditions.push(eq(auditLog.userId, userId));
  if (action)       conditions.push(eq(auditLog.action, action));
  if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
  if (dateFrom)     conditions.push(gte(auditLog.createdAt, new Date(dateFrom)));
  if (dateTo)       conditions.push(lte(auditLog.createdAt, new Date(dateTo)));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:           auditLog.id,
        action:       auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId:   auditLog.resourceId,
        details:      auditLog.details,
        ipAddress:    auditLog.ipAddress,
        createdAt:    auditLog.createdAt,
        userId:       auditLog.userId,
        userName:     user.name,
        employeeId:   user.employeeId,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return {
    data: rows as AuditLogEntry[],
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}

// ── Search analytics ──────────────────────────────────────────────────────────

export async function getSearchAnalytics(workspaceId: string): Promise<SearchAnalytics> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayStats, popular, zeroResult] = await Promise.all([
    db
      .select({
        total:     count(),
        zeroCount: sql<number>`count(*) filter (where ${searchLog.resultCount} = 0)`,
        avgMs:     sql<number>`avg(${searchLog.responseMs})`,
      })
      .from(searchLog)
      .where(
        and(
          eq(searchLog.workspaceId, workspaceId),
          gte(searchLog.createdAt, todayStart),
        ),
      ),
    db
      .select({ term: popularSearch.query, count: popularSearch.count })
      .from(popularSearch)
      .where(eq(popularSearch.workspaceId, workspaceId))
      .orderBy(desc(popularSearch.count))
      .limit(10),
    db
      .select({
        term:  searchLog.query,
        count: count(),
      })
      .from(searchLog)
      .where(
        and(
          eq(searchLog.workspaceId, workspaceId),
          sql`${searchLog.resultCount} = 0`,
          gte(searchLog.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .groupBy(searchLog.query)
      .orderBy(desc(count()))
      .limit(20),
  ]);

  const stats = todayStats[0];
  const totalToday = Number(stats?.total ?? 0);
  const zeroCount  = Number(stats?.zeroCount ?? 0);

  return {
    totalToday,
    zeroResultRate: totalToday > 0 ? Math.round((zeroCount / totalToday) * 100) : 0,
    avgResponseMs:  Math.round(Number(stats?.avgMs ?? 0)),
    popularTerms:   popular.map((p) => ({ term: p.term, count: Number(p.count) })),
    zeroResultTerms: zeroResult.map((z) => ({ term: z.term, count: Number(z.count) })),
  };
}
