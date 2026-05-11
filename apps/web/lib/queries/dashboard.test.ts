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
  auditLog: {
    id: "audit.id",
    action: "audit.action",
    resourceType: "audit.resourceType",
    resourceId: "audit.resourceId",
    userId: "audit.userId",
    createdAt: "audit.createdAt",
    workspaceId: "audit.workspaceId"
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
  relations: vi.fn(() => ({})),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values
  }))
}));

// menu-tree dependency: getQuickLinks delegates to getVisibleMenuTree but the
// test injects its own resolver via the optional 2nd arg, so this mock just
// has to exist to prevent the import from blowing up.
vi.mock("@/lib/server/menu-tree", () => ({
  getVisibleMenuTree: vi.fn(async () => [])
}));

import { db } from "@jarvis/db/client";
import {
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

  it("delegates to getVisibleMenuTree and flattens leaf routes", async () => {
    const session = {
      id: "s-1",
      userId: "u-1",
      workspaceId: "ws-1",
      employeeId: "E-1",
      name: "Kim",
      roles: ["employee"],
      permissions: ["KNOWLEDGE_READ"],
      createdAt: 0,
      expiresAt: 0
    } as unknown as Parameters<typeof getQuickLinks>[0];

    const tree = [
      {
        id: "dashboard",
        parentId: null,
        code: "nav.dashboard",
        kind: "menu",
        label: "Dashboard",
        icon: "home",
        routePath: "/dashboard",
        sortOrder: 10,
        children: []
      },
      {
        id: "group",
        parentId: null,
        code: "nav.group",
        kind: "menu",
        label: "Group",
        icon: null,
        routePath: null,
        sortOrder: 20,
        children: [
          {
            id: "child",
            parentId: "group",
            code: "nav.child",
            kind: "menu",
            label: "Child",
            icon: null,
            routePath: "/child",
            sortOrder: 21,
            children: []
          }
        ]
      }
    ];

    const result = await getQuickLinks(
      session,
      // resolveMenuTree dependency-inject — no DB hit
      async () => tree as never
    );

    expect(result).toEqual([
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/dashboard",
        icon: "home",
        sortOrder: 10
      },
      {
        id: "child",
        label: "Child",
        path: "/child",
        icon: null,
        sortOrder: 21
      }
    ]);
  });

  it("caps quick links at 8 results, sorted by sortOrder", async () => {
    const session = {
      id: "s-1",
      userId: "u-1",
      workspaceId: "ws-1",
      employeeId: "E-1",
      name: "Kim",
      roles: ["employee"],
      permissions: [],
      createdAt: 0,
      expiresAt: 0
    } as unknown as Parameters<typeof getQuickLinks>[0];

    const tree = Array.from({ length: 12 }, (_, i) => ({
      id: `n-${i}`,
      parentId: null,
      code: `nav.n${i}`,
      kind: "menu" as const,
      label: `N${i}`,
      icon: null,
      routePath: `/n/${i}`,
      // reverse order so the resolver does the sort
      sortOrder: 100 - i,
      children: []
    }));

    const result = await getQuickLinks(session, async () => tree as never);
    expect(result.length).toBe(8);
    expect(result[0]!.id).toBe("n-11"); // sortOrder 89 (lowest)
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
    const session = {
      id: "s-1",
      userId: "user-1",
      workspaceId: "ws-1",
      employeeId: "E-1",
      name: "Kim",
      roles: ["employee"],
      permissions: ["knowledge:read"],
      createdAt: 0,
      expiresAt: 0
    } as unknown as Parameters<typeof getDashboardData>[0];

    const result = await getDashboardData(session, {
      getQuickLinks: vi.fn().mockResolvedValue([]),
      getRecentActivity: vi.fn().mockResolvedValue([]),
      getMyTasks: vi.fn().mockResolvedValue([]),
      getStalePages: stalePagesLoader,
      getSearchTrends: vi.fn().mockResolvedValue([])
    });

    expect(result).toEqual({
      quickLinks: [],
      recentActivity: [],
      myTasks: [],
      stalePages: [],
      searchTrends: []
    });
    expect(stalePagesLoader).toHaveBeenCalledWith("ws-1", ["knowledge:read"]);
  });
});
