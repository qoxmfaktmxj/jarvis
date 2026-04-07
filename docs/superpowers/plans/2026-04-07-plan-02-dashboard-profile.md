# Jarvis Plan 02: Dashboard + Profile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Dashboard page with 7 server-side widgets and the Profile page with user info display and quick menu editor.

**Architecture:** Server Components fetch all widget data in parallel via Promise.all. Dashboard has no client-side fetching for initial load. Profile uses a Server Component for display and a Client Component ('use client') for the DnD-free quick menu editor with Server Action for saves.

**Tech Stack:** Next.js 15 Server Components, Server Actions, Drizzle ORM, shadcn/ui (Card, Badge, Button), Tailwind CSS v4, Vitest

**Prerequisites:** Plan 01 Foundation must be complete. `packages/db`, `packages/auth`, `packages/shared` must be built.

---

## File Map

```
apps/web/app/(app)/dashboard/
├── page.tsx                          MODIFY (replace placeholder with real widgets)
├── _components/
│   ├── StatCard.tsx                  CREATE
│   ├── QuickLinksWidget.tsx          CREATE
│   ├── RecentActivityWidget.tsx      CREATE
│   ├── MyTasksWidget.tsx             CREATE
│   ├── ProjectStatsWidget.tsx        CREATE
│   ├── StalePagesWidget.tsx          CREATE
│   ├── SearchTrendsWidget.tsx        CREATE
│   └── AttendanceSummaryWidget.tsx   CREATE
apps/web/app/(app)/profile/
├── page.tsx                          CREATE
└── _components/
    ├── ProfileInfo.tsx               CREATE
    └── QuickMenuEditor.tsx           CREATE
apps/web/app/actions/
└── profile.ts                        CREATE (Server Actions)
apps/web/lib/queries/
└── dashboard.ts                      CREATE (data fetching functions)
```

---

## Task 1: Dashboard data fetching layer

- [ ] Create `apps/web/lib/queries/dashboard.ts` with all 7 query functions and a parallel aggregator
- [ ] Write Vitest unit tests for each function
- [ ] Run tests: `pnpm -F web test lib/queries/dashboard`

### `apps/web/lib/queries/dashboard.ts`

```typescript
import { db } from '@jarvis/db/client';
import {
  menuItem,
  auditLog,
  projectTask,
  project,
  knowledgePage,
  popularSearch,
  attendance,
} from '@jarvis/db/schema';
import { and, eq, ne, lt, desc, count, sql, inArray } from 'drizzle-orm';

// ─── Return types ────────────────────────────────────────────────────────────

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
  resourceType: string | null;
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

export interface StalePage {
  id: string;
  title: string;
  nextReviewAt: Date;
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

// ─── Individual query functions ───────────────────────────────────────────────

export async function getQuickLinks(
  workspaceId: string,
  userRoles: string[],
): Promise<MenuItem[]> {
  const rows = await db
    .select({
      id: menuItem.id,
      label: menuItem.label,
      path: menuItem.path,
      icon: menuItem.icon,
      sortOrder: menuItem.sortOrder,
    })
    .from(menuItem)
    .where(
      and(
        eq(menuItem.workspaceId, workspaceId),
        eq(menuItem.isPinned, true),
        eq(menuItem.isActive, true),
      ),
    )
    .orderBy(menuItem.sortOrder);

  // Filter by requiredRole client-side to avoid complex SQL
  return rows.filter(
    (row) =>
      (row as typeof row & { requiredRole?: string | null }).requiredRole ==
        null ||
      userRoles.includes(
        (row as typeof row & { requiredRole?: string | null })
          .requiredRole as string,
      ),
  );
}

// Re-select with requiredRole for filtering, keep return type clean
export async function getQuickLinksWithRoleFilter(
  workspaceId: string,
  userRoles: string[],
): Promise<MenuItem[]> {
  const rows = await db
    .select({
      id: menuItem.id,
      label: menuItem.label,
      path: menuItem.path,
      icon: menuItem.icon,
      sortOrder: menuItem.sortOrder,
      requiredRole: menuItem.requiredRole,
    })
    .from(menuItem)
    .where(
      and(
        eq(menuItem.workspaceId, workspaceId),
        eq(menuItem.isPinned, true),
        eq(menuItem.isActive, true),
      ),
    )
    .orderBy(menuItem.sortOrder);

  return rows
    .filter(
      (row) =>
        row.requiredRole == null || userRoles.includes(row.requiredRole),
    )
    .map(({ requiredRole: _r, ...rest }) => rest);
}

export async function getRecentActivity(
  workspaceId: string,
): Promise<AuditLogEntry[]> {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      userId: auditLog.userId,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.workspaceId, workspaceId))
    .orderBy(desc(auditLog.createdAt))
    .limit(20) as Promise<AuditLogEntry[]>;
}

export async function getMyTasks(
  workspaceId: string,
  userId: string,
): Promise<TaskSummary[]> {
  return db
    .select({
      id: projectTask.id,
      title: projectTask.title,
      status: projectTask.status,
      dueDate: projectTask.dueDate,
      projectId: projectTask.projectId,
    })
    .from(projectTask)
    .where(
      and(
        eq(projectTask.workspaceId, workspaceId),
        eq(projectTask.assigneeId, userId),
        ne(projectTask.status, 'done'),
      ),
    )
    .orderBy(projectTask.dueDate) as Promise<TaskSummary[]>;
}

export async function getProjectStats(
  workspaceId: string,
): Promise<ProjectStats> {
  const rows = await db
    .select({
      status: project.status,
      count: count(),
    })
    .from(project)
    .where(eq(project.workspaceId, workspaceId))
    .groupBy(project.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const s = row.status ?? 'unknown';
    byStatus[s] = Number(row.count);
    total += Number(row.count);
  }
  return { total, byStatus };
}

export async function getStalePages(
  workspaceId: string,
): Promise<StalePage[]> {
  return db
    .select({
      id: knowledgePage.id,
      title: knowledgePage.title,
      nextReviewAt: knowledgePage.nextReviewAt,
    })
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        eq(knowledgePage.publishStatus, 'published'),
        lt(knowledgePage.nextReviewAt, sql`now()`),
      ),
    )
    .orderBy(knowledgePage.nextReviewAt)
    .limit(20) as Promise<StalePage[]>;
}

export async function getSearchTrends(
  workspaceId: string,
): Promise<TrendItem[]> {
  // Current ISO week label: e.g. "2026-W14"
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const week = Math.ceil(
    ((now.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7,
  );
  const weekLabel = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;

  return db
    .select({
      query: popularSearch.query,
      count: popularSearch.count,
    })
    .from(popularSearch)
    .where(
      and(
        eq(popularSearch.workspaceId, workspaceId),
        eq(popularSearch.weekLabel, weekLabel),
      ),
    )
    .orderBy(desc(popularSearch.count))
    .limit(10) as Promise<TrendItem[]>;
}

export async function getAttendanceSummary(
  workspaceId: string,
  userId: string,
): Promise<AttendanceSummary> {
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const lastDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  const rows = await db
    .select({
      status: attendance.status,
      count: count(),
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, workspaceId),
        eq(attendance.userId, userId),
        sql`${attendance.attendDate} >= ${firstDay}`,
        sql`${attendance.attendDate} <= ${lastDayStr}`,
      ),
    )
    .groupBy(attendance.status);

  const byStatus: Record<string, number> = {};
  let totalDays = 0;
  for (const row of rows) {
    const s = row.status ?? 'unknown';
    byStatus[s] = Number(row.count);
    totalDays += Number(row.count);
  }

  return {
    totalDays,
    presentDays: byStatus['present'] ?? 0,
    lateDays: byStatus['late'] ?? 0,
    absentDays: byStatus['absent'] ?? 0,
  };
}

// ─── Parallel aggregator ──────────────────────────────────────────────────────

export async function getDashboardData(
  workspaceId: string,
  userId: string,
  userRoles: string[],
): Promise<DashboardData> {
  const [
    quickLinks,
    recentActivity,
    myTasks,
    projectStats,
    stalePages,
    searchTrends,
    attendanceSummary,
  ] = await Promise.all([
    getQuickLinksWithRoleFilter(workspaceId, userRoles),
    getRecentActivity(workspaceId),
    getMyTasks(workspaceId, userId),
    getProjectStats(workspaceId),
    getStalePages(workspaceId),
    getSearchTrends(workspaceId),
    getAttendanceSummary(workspaceId, userId),
  ]);

  return {
    quickLinks,
    recentActivity,
    myTasks,
    projectStats,
    stalePages,
    searchTrends,
    attendanceSummary,
  };
}
```

### `apps/web/lib/queries/dashboard.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db client before importing query functions
vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  menuItem: {},
  auditLog: {},
  projectTask: {},
  project: {},
  knowledgePage: {},
  popularSearch: {},
  attendance: {},
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  desc: vi.fn((col: unknown) => col),
  count: vi.fn(() => 'count(*)'),
  sql: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) =>
    strings.join('?'),
  ),
  inArray: vi.fn(),
}));

import {
  getQuickLinksWithRoleFilter,
  getRecentActivity,
  getMyTasks,
  getProjectStats,
  getStalePages,
  getSearchTrends,
  getAttendanceSummary,
  getDashboardData,
} from './dashboard';
import { db } from '@jarvis/db/client';

const mockChain = (returnValue: unknown) => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'groupBy'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // The final awaited value
  (chain as Record<string, unknown>)[Symbol.iterator as unknown as string] =
    undefined;
  // Make the chain thenable
  Object.assign(chain, {
    then: (resolve: (v: unknown) => void) => resolve(returnValue),
    catch: (reject: (e: unknown) => void) => chain,
  });
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getQuickLinksWithRoleFilter', () => {
  it('returns items matching user roles', async () => {
    const rows = [
      {
        id: 'link-1',
        label: 'Home',
        path: '/',
        icon: null,
        sortOrder: 0,
        requiredRole: null,
      },
      {
        id: 'link-2',
        label: 'Admin',
        path: '/admin',
        icon: null,
        sortOrder: 1,
        requiredRole: 'admin',
      },
      {
        id: 'link-3',
        label: 'HR',
        path: '/hr',
        icon: null,
        sortOrder: 2,
        requiredRole: 'hr_manager',
      },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getQuickLinksWithRoleFilter('ws-1', ['admin']);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['link-1', 'link-2']);
    expect(result[0]).not.toHaveProperty('requiredRole');
  });

  it('returns all items when user has all required roles', async () => {
    const rows = [
      { id: 'a', label: 'A', path: '/a', icon: null, sortOrder: 0, requiredRole: null },
      { id: 'b', label: 'B', path: '/b', icon: null, sortOrder: 1, requiredRole: 'hr_manager' },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getQuickLinksWithRoleFilter('ws-1', ['hr_manager', 'employee']);
    expect(result).toHaveLength(2);
  });
});

describe('getRecentActivity', () => {
  it('returns at most 20 audit log entries', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `log-${i}`,
      action: 'CREATE',
      resourceType: 'page',
      resourceId: `${i}`,
      userId: 'user-1',
      createdAt: new Date(),
    }));
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getRecentActivity('ws-1');
    expect(result).toHaveLength(20);
    expect(result[0]).toHaveProperty('action');
    expect(result[0]).toHaveProperty('createdAt');
  });
});

describe('getMyTasks', () => {
  it('returns tasks assigned to the user excluding done', async () => {
    const rows = [
      { id: 't-1', title: 'Fix bug', status: 'todo', dueDate: null, projectId: 'p-1' },
      { id: 't-2', title: 'Write docs', status: 'in_progress', dueDate: '2026-04-10', projectId: 'p-1' },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getMyTasks('ws-1', 'user-1');
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status !== 'done')).toBe(true);
  });
});

describe('getProjectStats', () => {
  it('aggregates counts by status', async () => {
    const rows = [
      { status: 'active', count: 3 },
      { status: 'archived', count: 7 },
      { status: 'planning', count: 2 },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getProjectStats('ws-1');
    expect(result.total).toBe(12);
    expect(result.byStatus.active).toBe(3);
    expect(result.byStatus.archived).toBe(7);
    expect(result.byStatus.planning).toBe(2);
  });

  it('returns zero total for empty workspace', async () => {
    const chain = mockChain([]);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getProjectStats('ws-empty');
    expect(result.total).toBe(0);
    expect(result.byStatus).toEqual({});
  });
});

describe('getStalePages', () => {
  it('returns pages past their review date', async () => {
    const rows = [
      { id: 'pg-1', title: 'Onboarding Guide', nextReviewAt: new Date('2026-01-01') },
      { id: 'pg-2', title: 'API Docs', nextReviewAt: new Date('2026-02-15') },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getStalePages('ws-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('nextReviewAt');
  });
});

describe('getSearchTrends', () => {
  it('returns top 10 search queries for current week', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      query: `query-${i}`,
      count: 100 - i * 5,
    }));
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getSearchTrends('ws-1');
    expect(result).toHaveLength(10);
    expect(result[0]).toHaveProperty('query');
    expect(result[0]).toHaveProperty('count');
  });
});

describe('getAttendanceSummary', () => {
  it('aggregates attendance by status', async () => {
    const rows = [
      { status: 'present', count: 18 },
      { status: 'late', count: 2 },
      { status: 'absent', count: 1 },
    ];
    const chain = mockChain(rows);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getAttendanceSummary('ws-1', 'user-1');
    expect(result.totalDays).toBe(21);
    expect(result.presentDays).toBe(18);
    expect(result.lateDays).toBe(2);
    expect(result.absentDays).toBe(1);
  });

  it('returns zeros when no attendance records found', async () => {
    const chain = mockChain([]);
    vi.mocked(db.select).mockReturnValue(chain as ReturnType<typeof db.select>);

    const result = await getAttendanceSummary('ws-1', 'user-new');
    expect(result).toEqual({ totalDays: 0, presentDays: 0, lateDays: 0, absentDays: 0 });
  });
});

describe('getDashboardData', () => {
  it('returns all 7 data shapes in parallel', async () => {
    // Each db.select call returns a different mock
    let callCount = 0;
    const mocks = [
      [{ id: 'link-1', label: 'Home', path: '/', icon: null, sortOrder: 0, requiredRole: null }],
      [{ id: 'log-1', action: 'CREATE', resourceType: null, resourceId: null, userId: null, createdAt: new Date() }],
      [{ id: 'task-1', title: 'Task', status: 'todo', dueDate: null, projectId: 'p-1' }],
      [{ status: 'active', count: 5 }],
      [{ id: 'pg-1', title: 'Page', nextReviewAt: new Date('2026-01-01') }],
      [{ query: 'search term', count: 42 }],
      [{ status: 'present', count: 20 }],
    ];

    vi.mocked(db.select).mockImplementation(() => {
      const data = mocks[callCount++ % mocks.length];
      return mockChain(data) as ReturnType<typeof db.select>;
    });

    const result = await getDashboardData('ws-1', 'user-1', ['employee']);
    expect(result).toHaveProperty('quickLinks');
    expect(result).toHaveProperty('recentActivity');
    expect(result).toHaveProperty('myTasks');
    expect(result).toHaveProperty('projectStats');
    expect(result).toHaveProperty('stalePages');
    expect(result).toHaveProperty('searchTrends');
    expect(result).toHaveProperty('attendanceSummary');
  });
});
```

**Expected test output:**
```
 PASS  apps/web/lib/queries/dashboard.test.ts
  getQuickLinksWithRoleFilter
    ✓ returns items matching user roles
    ✓ returns all items when user has all required roles
  getRecentActivity
    ✓ returns at most 20 audit log entries
  getMyTasks
    ✓ returns tasks assigned to the user excluding done
  getProjectStats
    ✓ aggregates counts by status
    ✓ returns zero total for empty workspace
  getStalePages
    ✓ returns pages past their review date
  getSearchTrends
    ✓ returns top 10 search queries for current week
  getAttendanceSummary
    ✓ aggregates attendance by status
    ✓ returns zeros when no attendance records found
  getDashboardData
    ✓ returns all 7 data shapes in parallel

Test Files  1 passed (1)
Tests       11 passed (11)
```

**Run command:**
```bash
pnpm -F web test lib/queries/dashboard
```

---

## Task 2: StatCard component

- [ ] Create `apps/web/app/(app)/dashboard/_components/StatCard.tsx`

### `apps/web/app/(app)/dashboard/_components/StatCard.tsx`

```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  href?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  href,
  icon,
  className,
}: StatCardProps) {
  const content = (
    <Card className={cn('h-full transition-colors hover:bg-muted/50', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <span className="text-muted-foreground">{icon}</span>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}
```

---

## Task 3: Dashboard widgets — Quick Links, Recent Activity, My Tasks

- [ ] Create `QuickLinksWidget.tsx`, `RecentActivityWidget.tsx`, `MyTasksWidget.tsx`
- [ ] All are Server Components (no 'use client')

### `apps/web/app/(app)/dashboard/_components/QuickLinksWidget.tsx`

```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MenuItem } from '@/lib/queries/dashboard';

interface QuickLinksWidgetProps {
  items: MenuItem[];
}

export function QuickLinksWidget({ items }: QuickLinksWidgetProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick Links</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pinned links yet.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.path ?? '#'}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  {item.icon && (
                    <span className="text-muted-foreground" aria-hidden>
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/dashboard/_components/RecentActivityWidget.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AuditLogEntry } from '@/lib/queries/dashboard';

interface RecentActivityWidgetProps {
  entries: AuditLogEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  VIEW: 'bg-gray-100 text-gray-700',
};

function actionColor(action: string): string {
  return ACTION_COLORS[action.toUpperCase()] ?? 'bg-gray-100 text-gray-700';
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RecentActivityWidget({ entries }: RecentActivityWidgetProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${actionColor(entry.action)}`}
                    >
                      {entry.action}
                    </span>
                    {entry.resourceType && (
                      <span className="text-muted-foreground">
                        {entry.resourceType}
                      </span>
                    )}
                  </span>
                  {entry.resourceId && (
                    <span className="truncate text-xs text-muted-foreground">
                      #{entry.resourceId.slice(0, 8)}
                    </span>
                  )}
                </div>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={new Date(entry.createdAt).toISOString()}
                >
                  {timeAgo(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/dashboard/_components/MyTasksWidget.tsx`

```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TaskSummary } from '@/lib/queries/dashboard';

interface MyTasksWidgetProps {
  tasks: TaskSummary[];
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  todo: 'outline',
  in_progress: 'default',
  review: 'secondary',
  blocked: 'destructive',
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function MyTasksWidget({ tasks }: MyTasksWidgetProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          My Tasks
          {tasks.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {tasks.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All tasks done. Great work!
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-2 rounded-md border px-2 py-2 text-sm"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/projects/${task.projectId}/tasks/${task.id}`}
                    className="font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                  {task.dueDate && (
                    <span
                      className={`text-xs ${isOverdue(task.dueDate) ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      Due {task.dueDate}
                    </span>
                  )}
                </div>
                <Badge
                  variant={STATUS_VARIANT[task.status] ?? 'outline'}
                  className="shrink-0 text-xs"
                >
                  {task.status.replace('_', ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Task 4: Dashboard widgets — Project Stats, Stale Pages, Search Trends, Attendance

- [ ] Create `ProjectStatsWidget.tsx`, `StalePagesWidget.tsx`, `SearchTrendsWidget.tsx`, `AttendanceSummaryWidget.tsx`
- [ ] All Server Components

### `apps/web/app/(app)/dashboard/_components/ProjectStatsWidget.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from './StatCard';
import type { ProjectStats } from '@/lib/queries/dashboard';

interface ProjectStatsWidgetProps {
  stats: ProjectStats;
}

export function ProjectStatsWidget({ stats }: ProjectStatsWidgetProps) {
  const statusEntries = Object.entries(stats.byStatus).sort(
    ([, a], [, b]) => b - a,
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Project Stats</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Projects</p>
        </div>
        {statusEntries.length > 0 && (
          <ul className="space-y-1">
            {statusEntries.map(([status, cnt]) => (
              <li
                key={status}
                className="flex items-center justify-between text-sm"
              >
                <span className="capitalize text-muted-foreground">
                  {status.replace('_', ' ')}
                </span>
                <span className="font-medium">{cnt}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/dashboard/_components/StalePagesWidget.tsx`

```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { StalePage } from '@/lib/queries/dashboard';

interface StalePagesWidgetProps {
  pages: StalePage[];
}

function daysSince(date: Date): number {
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function StalePagesWidget({ pages }: StalePagesWidgetProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          Stale Pages
          {pages.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {pages.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All pages are up to date.
          </p>
        ) : (
          <ul className="space-y-2">
            {pages.map((page) => {
              const overdueDays = daysSince(page.nextReviewAt);
              return (
                <li key={page.id} className="flex items-start justify-between gap-2 text-sm">
                  <Link
                    href={`/knowledge/${page.id}`}
                    className="line-clamp-2 font-medium hover:underline"
                  >
                    {page.title}
                  </Link>
                  <span className="shrink-0 text-xs text-destructive">
                    {overdueDays}d overdue
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/dashboard/_components/SearchTrendsWidget.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TrendItem } from '@/lib/queries/dashboard';

interface SearchTrendsWidgetProps {
  trends: TrendItem[];
}

export function SearchTrendsWidget({ trends }: SearchTrendsWidgetProps) {
  const maxCount = trends[0]?.count ?? 1;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Search Trends</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {trends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No search data this week.</p>
        ) : (
          <ol className="space-y-2">
            {trends.map((trend, index) => (
              <li key={trend.query} className="flex items-center gap-2 text-sm">
                <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{trend.query}</span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((trend.count / maxCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {trend.count}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/dashboard/_components/AttendanceSummaryWidget.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from './StatCard';
import type { AttendanceSummary } from '@/lib/queries/dashboard';

interface AttendanceSummaryWidgetProps {
  summary: AttendanceSummary;
}

export function AttendanceSummaryWidget({ summary }: AttendanceSummaryWidgetProps) {
  const attendanceRate =
    summary.totalDays > 0
      ? Math.round(
          ((summary.presentDays + summary.lateDays) / summary.totalDays) * 100,
        )
      : 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Attendance This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="text-center">
          <p className="text-3xl font-bold">{attendanceRate}%</p>
          <p className="text-xs text-muted-foreground">Attendance Rate</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${attendanceRate}%` }}
          />
        </div>
        <ul className="space-y-1 text-sm">
          <li className="flex justify-between">
            <span className="text-muted-foreground">Present</span>
            <span className="font-medium">{summary.presentDays}d</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Late</span>
            <span className="font-medium text-yellow-600">{summary.lateDays}d</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Absent</span>
            <span className="font-medium text-destructive">{summary.absentDays}d</span>
          </li>
          <li className="flex justify-between border-t pt-1">
            <span className="text-muted-foreground">Total Days</span>
            <span className="font-medium">{summary.totalDays}d</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
```

---

## Task 5: Dashboard page assembly

- [ ] Replace `apps/web/app/(app)/dashboard/page.tsx` with full Server Component
- [ ] Grid layout: 3-column top row, 4-column bottom row
- [ ] Write Playwright E2E test

### `apps/web/app/(app)/dashboard/page.tsx`

```typescript
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { getDashboardData } from '@/lib/queries/dashboard';
import { QuickLinksWidget } from './_components/QuickLinksWidget';
import { RecentActivityWidget } from './_components/RecentActivityWidget';
import { MyTasksWidget } from './_components/MyTasksWidget';
import { ProjectStatsWidget } from './_components/ProjectStatsWidget';
import { StalePagesWidget } from './_components/StalePagesWidget';
import { SearchTrendsWidget } from './_components/SearchTrendsWidget';
import { AttendanceSummaryWidget } from './_components/AttendanceSummaryWidget';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id');

  if (!sessionId) {
    redirect('/login');
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect('/login');
  }

  const data = await getDashboardData(
    session.workspaceId,
    session.userId,
    session.roles,
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.name}.
        </p>
      </div>

      {/* Top row: 3 equal columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickLinksWidget items={data.quickLinks} />
        <RecentActivityWidget entries={data.recentActivity} />
        <MyTasksWidget tasks={data.myTasks} />
      </div>

      {/* Bottom row: 4 equal columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectStatsWidget stats={data.projectStats} />
        <StalePagesWidget pages={data.stalePages} />
        <SearchTrendsWidget trends={data.searchTrends} />
        <AttendanceSummaryWidget summary={data.attendanceSummary} />
      </div>
    </div>
  );
}
```

### `apps/web/e2e/dashboard.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// Assumes a seeded test workspace with session cookie set via globalSetup
test.describe('Dashboard page', () => {
  test.beforeEach(async ({ page }) => {
    // Seed cookie from env or fixture
    await page.goto('/dashboard');
  });

  test('shows all 7 widget headings', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Quick Links')).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();
    await expect(page.getByText('My Tasks')).toBeVisible();
    await expect(page.getByText('Project Stats')).toBeVisible();
    await expect(page.getByText('Stale Pages')).toBeVisible();
    await expect(page.getByText('Search Trends')).toBeVisible();
    await expect(page.getByText('Attendance This Month')).toBeVisible();
  });

  test('redirects to /login when session cookie is absent', async ({
    browser,
  }) => {
    const ctx = await browser.newContext(); // no cookies
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
```

**Run command:**
```bash
pnpm -F web test:e2e e2e/dashboard.spec.ts
```

---

## Task 6: Profile page + Server Action

- [ ] Create `apps/web/app/actions/profile.ts`
- [ ] Create `apps/web/app/(app)/profile/_components/ProfileInfo.tsx`
- [ ] Create `apps/web/app/(app)/profile/_components/QuickMenuEditor.tsx`
- [ ] Create `apps/web/app/(app)/profile/page.tsx`

### `apps/web/app/actions/profile.ts`

```typescript
'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@jarvis/db/client';
import { menuItem } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { eq, and } from 'drizzle-orm';

export async function updateQuickMenuOrder(
  menuIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id');

  if (!sessionId) {
    return { success: false, error: 'Unauthorized' };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Update sort_order for each menu item in the new order.
  // Only update items that belong to this workspace and are pinned.
  await Promise.all(
    menuIds.map((id, index) =>
      db
        .update(menuItem)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(
            eq(menuItem.id, id),
            eq(menuItem.workspaceId, session.workspaceId),
            eq(menuItem.isPinned, true),
          ),
        ),
    ),
  );

  revalidatePath('/dashboard');
  revalidatePath('/profile');

  return { success: true };
}
```

### `apps/web/app/(app)/profile/_components/ProfileInfo.tsx`

```typescript
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { JarvisSession } from '@jarvis/auth/types';

interface ProfileInfoProps {
  session: JarvisSession;
}

export function ProfileInfo({ session }: ProfileInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">User Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="font-medium text-muted-foreground">Name</dt>
          <dd>{session.name}</dd>

          <dt className="font-medium text-muted-foreground">Email</dt>
          <dd>{session.email}</dd>

          {session.employeeId && (
            <>
              <dt className="font-medium text-muted-foreground">Employee ID</dt>
              <dd className="font-mono text-xs">{session.employeeId}</dd>
            </>
          )}

          <dt className="font-medium text-muted-foreground">Roles</dt>
          <dd className="flex flex-wrap gap-1">
            {session.roles.length === 0 ? (
              <span className="text-muted-foreground">No roles assigned</span>
            ) : (
              session.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))
            )}
          </dd>

          <dt className="font-medium text-muted-foreground">Session ID</dt>
          <dd className="truncate font-mono text-xs text-muted-foreground">
            {session.id}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
```

### `apps/web/app/(app)/profile/_components/QuickMenuEditor.tsx`

```typescript
'use client';

import { useOptimistic, useTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { updateQuickMenuOrder } from '@/app/actions/profile';
import type { MenuItem } from '@/lib/queries/dashboard';

interface QuickMenuEditorProps {
  initialItems: MenuItem[];
}

export function QuickMenuEditor({ initialItems }: QuickMenuEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [optimisticItems, setOptimisticItems] = useOptimistic(
    initialItems,
    (_current: MenuItem[], next: MenuItem[]) => next,
  );

  function move(index: number, direction: 'up' | 'down') {
    const next = [...optimisticItems];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    startTransition(() => {
      setOptimisticItems(next);
    });
  }

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    const ids = optimisticItems.map((item) => item.id);

    startTransition(async () => {
      const result = await updateQuickMenuOrder(ids);
      if (!result.success) {
        setSaveError(result.error ?? 'Failed to save order');
      } else {
        setSaveSuccess(true);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick Menu Order</CardTitle>
      </CardHeader>
      <CardContent>
        {optimisticItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pinned menu items. Pin items from the admin menu settings.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {optimisticItems.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="text-sm font-medium">{item.label}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0 || isPending}
                    onClick={() => move(index, 'up')}
                    aria-label={`Move ${item.label} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === optimisticItems.length - 1 || isPending}
                    onClick={() => move(index, 'down')}
                    aria-label={`Move ${item.label} down`}
                  >
                    ↓
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="mt-2 text-sm text-destructive">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="mt-2 text-sm text-green-600">Order saved.</p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSave}
          disabled={isPending || optimisticItems.length === 0}
          size="sm"
        >
          {isPending ? 'Saving...' : 'Save Order'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### `apps/web/app/(app)/profile/page.tsx`

```typescript
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { getQuickLinksWithRoleFilter } from '@/lib/queries/dashboard';
import { ProfileInfo } from './_components/ProfileInfo';
import { QuickMenuEditor } from './_components/QuickMenuEditor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const headersList = await headers();
  const sessionId = headersList.get('x-session-id');

  if (!sessionId) {
    redirect('/login');
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect('/login');
  }

  const quickLinks = await getQuickLinksWithRoleFilter(
    session.workspaceId,
    session.roles,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences.
        </p>
      </div>

      <ProfileInfo session={session} />

      <QuickMenuEditor initialItems={quickLinks} />
    </div>
  );
}
```

---

## Task 7: Commit

- [ ] Stage all new and modified files
- [ ] Commit with conventional commit message

```bash
git add \
  apps/web/lib/queries/dashboard.ts \
  apps/web/lib/queries/dashboard.test.ts \
  apps/web/app/\(app\)/dashboard/page.tsx \
  apps/web/app/\(app\)/dashboard/_components/StatCard.tsx \
  apps/web/app/\(app\)/dashboard/_components/QuickLinksWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/RecentActivityWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/MyTasksWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/ProjectStatsWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/StalePagesWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/SearchTrendsWidget.tsx \
  apps/web/app/\(app\)/dashboard/_components/AttendanceSummaryWidget.tsx \
  apps/web/app/\(app\)/profile/page.tsx \
  apps/web/app/\(app\)/profile/_components/ProfileInfo.tsx \
  apps/web/app/\(app\)/profile/_components/QuickMenuEditor.tsx \
  apps/web/app/actions/profile.ts \
  apps/web/e2e/dashboard.spec.ts

git commit -m "feat: dashboard widgets + profile page"
```

---

## Verification Checklist

- [ ] `pnpm -F web test lib/queries/dashboard` — 11 tests pass
- [ ] `pnpm -F web build` — no TypeScript errors
- [ ] `pnpm -F web test:e2e e2e/dashboard.spec.ts` — 2 tests pass
- [ ] Visit `/dashboard` in browser — all 7 widget headings visible
- [ ] Visit `/profile` — user info shown, quick menu editor renders and saves
- [ ] Unauthenticated request to `/dashboard` redirects to `/login`
