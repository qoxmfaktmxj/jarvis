import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock
} from "vitest";

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn()
  }
}));

vi.mock("@jarvis/db/schema", () => ({
  menuItem: {
    id: "menu.id",
    label: "menu.label",
    routePath: "menu.routePath",
    icon: "menu.icon",
    sortOrder: "menu.sortOrder",
    requiredRole: "menu.requiredRole",
    workspaceId: "menu.workspaceId",
    parentId: "menu.parentId",
    isVisible: "menu.isVisible"
  },
  auditLog: {
    id: "audit.id",
    action: "audit.action",
    resourceType: "audit.resourceType",
    resourceId: "audit.resourceId",
    userId: "audit.userId",
    createdAt: "audit.createdAt",
    workspaceId: "audit.workspaceId"
  },
  projectTask: {
    id: "task.id",
    title: "task.title",
    status: "task.status",
    dueDate: "task.dueDate",
    projectId: "task.projectId",
    workspaceId: "task.workspaceId",
    assigneeId: "task.assigneeId"
  },
  project: {
    status: "project.status",
    workspaceId: "project.workspaceId"
  },
  knowledgePage: {
    id: "page.id",
    title: "page.title",
    publishStatus: "page.publishStatus",
    lastVerifiedAt: "page.lastVerifiedAt",
    freshnessSlaDays: "page.freshnessSlaDays",
    createdAt: "page.createdAt",
    workspaceId: "page.workspaceId"
  },
  popularSearch: {
    query: "search.query",
    count: "search.count",
    period: "search.period",
    workspaceId: "search.workspaceId"
  },
  attendance: {
    status: "attendance.status",
    attendDate: "attendance.attendDate",
    workspaceId: "attendance.workspaceId",
    userId: "attendance.userId"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((value: unknown) => value),
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  isNull: vi.fn((value: unknown) => ({ value, op: "isNull" })),
  ne: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  count: vi.fn(() => "count(*)"),
  gte: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  lte: vi.fn((column: unknown, value: unknown) => ({ column, value }))
}));

import { db } from "@jarvis/db/client";
import {
  buildAttendanceSummary,
  buildProjectStats,
  getDashboardData,
  getQuickLinks,
  getSearchPeriodStart,
  getStalePages,
  isKnowledgePageStale
} from "./dashboard";

function createChain<T>(value: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (resolve: (result: T) => void) => Promise.resolve(resolve(value))
  };

  return chain;
}

describe("dashboard queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters quick links by role, visibility, and route presence", async () => {
    const selectMock = db.select as unknown as Mock;
    const chain = createChain([
      {
        id: "dashboard",
        label: "Dashboard",
        routePath: "/dashboard",
        icon: "home",
        sortOrder: 0,
        requiredRole: null,
        isVisible: true
      },
      {
        id: "admin",
        label: "Admin",
        routePath: "/admin",
        icon: "shield",
        sortOrder: 1,
        requiredRole: "admin",
        isVisible: true
      },
      {
        id: "hidden",
        label: "Hidden",
        routePath: "/hidden",
        icon: null,
        sortOrder: 2,
        requiredRole: null,
        isVisible: false
      },
      {
        id: "group",
        label: "Group",
        routePath: null,
        icon: null,
        sortOrder: 3,
        requiredRole: null,
        isVisible: true
      }
    ]);
    selectMock.mockReturnValue(chain);

    const result = await getQuickLinks("ws-1", ["employee"]);

    expect(result).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/dashboard",
        icon: "home",
        sortOrder: 0
      }
    ]);
    expect(chain.limit).not.toHaveBeenCalled();
  });

  it("builds project stats from grouped rows", () => {
    expect(
      buildProjectStats([
        { status: "active", count: 3 },
        { status: "planning", count: 1 },
        { status: null, count: 2 }
      ])
    ).toEqual({
      total: 6,
      byStatus: {
        active: 3,
        planning: 1,
        unknown: 2
      }
    });
  });

  it("builds attendance summary from grouped rows", () => {
    expect(
      buildAttendanceSummary([
        { status: "present", count: 18 },
        { status: "late", count: 2 },
        { status: "absent", count: 1 }
      ])
    ).toEqual({
      totalDays: 21,
      presentDays: 18,
      lateDays: 2,
      absentDays: 1
    });
  });

  it("calculates the current search period start as a monday", () => {
    expect(getSearchPeriodStart(new Date("2026-04-09T09:00:00.000Z"))).toBe(
      "2026-04-06"
    );
  });

  it("marks published knowledge pages stale when verification is overdue", () => {
    expect(
      isKnowledgePageStale(
        {
          id: "page-1",
          title: "Runbook",
          publishStatus: "published",
          freshnessSlaDays: 30,
          lastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2025-12-01T00:00:00.000Z")
        },
        new Date("2026-02-15T00:00:00.000Z")
      )
    ).toBe(true);
  });

  it("returns only stale pages from raw rows", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(
      createChain([
        {
          id: "page-1",
          title: "Old",
          publishStatus: "published",
          freshnessSlaDays: 30,
          lastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2025-12-01T00:00:00.000Z")
        },
        {
          id: "page-2",
          title: "Fresh",
          publishStatus: "published",
          freshnessSlaDays: 90,
          lastVerifiedAt: new Date("2026-04-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ])
    );

    const result = await getStalePages("ws-1", new Date("2026-04-15T00:00:00.000Z"));

    expect(result).toEqual([
      {
        id: "page-1",
        title: "Old",
        lastReviewedAt: new Date("2026-01-01T00:00:00.000Z"),
        overdueDays: 74
      }
    ]);
  });

  it("aggregates dashboard data in parallel", async () => {
    const result = await getDashboardData("ws-1", "user-1", ["employee"], {
      getQuickLinks: vi.fn().mockResolvedValue([]),
      getRecentActivity: vi.fn().mockResolvedValue([]),
      getMyTasks: vi.fn().mockResolvedValue([]),
      getProjectStats: vi.fn().mockResolvedValue({ total: 0, byStatus: {} }),
      getStalePages: vi.fn().mockResolvedValue([]),
      getSearchTrends: vi.fn().mockResolvedValue([]),
      getAttendanceSummary: vi.fn().mockResolvedValue({
        totalDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0
      })
    });

    expect(result).toEqual({
      quickLinks: [],
      recentActivity: [],
      myTasks: [],
      projectStats: { total: 0, byStatus: {} },
      stalePages: [],
      searchTrends: [],
      attendanceSummary: {
        totalDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0
      }
    });
  });
});
