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
  wikiPageIndex: {
    id: "wiki.id",
    path: "wiki.path",
    slug: "wiki.slug",
    title: "wiki.title",
    updatedAt: "wiki.updatedAt",
    freshnessSlaDays: "wiki.freshnessSlaDays",
    sensitivity: "wiki.sensitivity",
    requiredPermission: "wiki.requiredPermission",
    stale: "wiki.stale",
    publishedStatus: "wiki.publishedStatus",
    workspaceId: "wiki.workspaceId"
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
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, op: "inArray", values })),
  isNotNull: vi.fn((value: unknown) => ({ value, op: "isNotNull" })),
  isNull: vi.fn((value: unknown) => ({ value, op: "isNull" })),
  lt: vi.fn((column: unknown, value: unknown) => ({ column, op: "lt", value })),
  ne: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  count: vi.fn(() => "count(*)"),
  gte: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  lte: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values
  }))
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

  it("queries pages whose freshness SLA deadline has passed", async () => {
    const selectMock = db.select as unknown as Mock;
    const chain = createChain([]);
    selectMock.mockReturnValue(chain);

    await getStalePages("ws-1", ["knowledge:read"], new Date("2026-04-16T00:00:00.000Z"));

    const whereCalls = chain.where.mock.calls as unknown as Array<[unknown]>;
    const firstWhereCall = whereCalls[0];
    expect(firstWhereCall).toBeDefined();
    const whereArg = firstWhereCall![0] as unknown[];
    expect(whereArg).toEqual(
      expect.arrayContaining([
        { column: "wiki.workspaceId", value: "ws-1" },
        { column: "wiki.publishedStatus", value: "published" },
        { value: "wiki.freshnessSlaDays", op: "isNotNull" },
        expect.objectContaining({ column: "wiki.updatedAt", op: "lt" }),
        { column: "wiki.sensitivity", op: "inArray", values: ["PUBLIC", "INTERNAL"] },
        {
          op: "or",
          args: [
            { value: "wiki.requiredPermission", op: "isNull" },
            { column: "wiki.requiredPermission", op: "inArray", values: ["knowledge:read"] }
          ]
        }
      ])
    );
    expect(whereArg).not.toContainEqual({ column: "wiki.stale", value: true });
  });

  it("maps stale pages from raw rows", async () => {
    const selectMock = db.select as unknown as Mock;
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    selectMock.mockReturnValue(
      createChain([
        {
          id: "page-1",
          path: "wiki/ws-1/auto/policy/old.md",
          slug: "old",
          title: "Old",
          updatedAt,
          freshnessSlaDays: 30
        }
      ])
    );

    const now = new Date("2026-04-15T00:00:00.000Z");
    const result = await getStalePages("ws-1", ["knowledge:read"], now);

    const expectedOverdueDays = Math.floor(
      (now.getTime() -
        (updatedAt.getTime() + 30 * 24 * 60 * 60 * 1000)) /
        (1000 * 60 * 60 * 24)
    );

    expect(result).toEqual([
      {
        id: "page-1",
        path: "wiki/ws-1/auto/policy/old.md",
        slug: "old",
        title: "Old",
        lastReviewedAt: updatedAt,
        overdueDays: expectedOverdueDays
      }
    ]);
  });

  it("calculates overdueDays from freshnessSlaDays when present", async () => {
    const selectMock = db.select as unknown as Mock;
    const updatedAt = new Date("2026-03-01T00:00:00.000Z"); // 46일 전
    selectMock.mockReturnValue(
      createChain([
        {
          id: "page-2",
          path: "wiki/ws-1/auto/policy/policy.md",
          slug: "policy",
          title: "Policy",
          updatedAt,
          freshnessSlaDays: 30
        }
      ])
    );
    const now = new Date("2026-04-16T00:00:00.000Z");
    const result = await getStalePages("ws-1", ["knowledge:read"], now);
    // deadline = 2026-03-31, now = 2026-04-16, overdueDays = 16
    expect(result[0]!.overdueDays).toBe(16);
  });

  it("aggregates dashboard data in parallel", async () => {
    const stalePagesLoader = vi.fn().mockResolvedValue([]);
    const result = await getDashboardData("ws-1", "user-1", ["employee"], ["knowledge:read"], {
      getQuickLinks: vi.fn().mockResolvedValue([]),
      getRecentActivity: vi.fn().mockResolvedValue([]),
      getMyTasks: vi.fn().mockResolvedValue([]),
      getProjectStats: vi.fn().mockResolvedValue({ total: 0, byStatus: {} }),
      getStalePages: stalePagesLoader,
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
    expect(stalePagesLoader).toHaveBeenCalledWith("ws-1", ["knowledge:read"]);
  });
});
