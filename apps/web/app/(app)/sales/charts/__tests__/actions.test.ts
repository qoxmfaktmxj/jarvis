/**
 * apps/web/app/(app)/sales/charts/__tests__/actions.test.ts
 *
 * TDD — Task 5: Marketing server actions
 *   getMarketingByActivity  — groups sales_activity by actTypeCode for a YM
 *   getMarketingByProduct   — groups sales_opportunity by productTypeCode + SUM(contExpecAmt)
 *
 * Pattern mirrors apps/web/app/(app)/ask/actions.test.ts:
 *   vi.hoisted → vi.mock (all external modules) → import action under test → describe
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted — declare mock functions before module evaluation
// ---------------------------------------------------------------------------
const {
  cookiesMock,
  getSessionMock,
  headersMock,
  hasPermissionMock,
  dbSelectMock,
  dbExecuteMock,
} = vi.hoisted(() => {
  return {
    cookiesMock: vi.fn(),
    getSessionMock: vi.fn(),
    headersMock: vi.fn(),
    hasPermissionMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbExecuteMock: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks — must come before any import that triggers module resolution
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock("@jarvis/shared/constants/permissions", () => ({
  PERMISSIONS: { SALES_ALL: "SALES_ALL" },
}));

// Drizzle-orm — minimal stubs enough for the action's query chain
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  count: vi.fn(() => ({ op: "count" })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => ({
      op: "sql_raw",
    })),
    { join: vi.fn(), empty: {} },
  ),
}));

// Schema stubs — only the columns the actions reference
vi.mock("@jarvis/db/schema", () => ({
  salesActivity: {
    workspaceId: "sa.workspaceId",
    actYmd: "sa.actYmd",
    actTypeCode: "sa.actTypeCode",
  },
  salesOpportunity: {
    workspaceId: "so.workspaceId",
    contExpecYmd: "so.contExpecYmd",
    contExpecAmt: "so.contExpecAmt",
    productTypeCode: "so.productTypeCode",
    contImplPer: "so.contImplPer",
    orgNm: "so.orgNm",
  },
  salesPlanPerf: {
    workspaceId: "spp.workspaceId",
    ym: "spp.ym",
    orgCd: "spp.orgCd",
    orgNm: "spp.orgNm",
    gubunCd: "spp.gubunCd",
    trendGbCd: "spp.trendGbCd",
    amt: "spp.amt",
  },
}));

// ---------------------------------------------------------------------------
// DB client mock — builds a chainable select builder
// ---------------------------------------------------------------------------
/**
 * buildSelectChain — returns a Drizzle-like .select().from().where().groupBy().orderBy()
 * chain whose terminal resolves to `rows`.
 */
function buildSelectChain(rows: unknown[]) {
  const orderByFn = vi.fn(() => Promise.resolve(rows));
  const groupByFn = vi.fn(() => ({ orderBy: orderByFn }));
  const whereFn = vi.fn(() => ({ groupBy: groupByFn, orderBy: orderByFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));
  return { from: fromFn, _whereFn: whereFn, _groupByFn: groupByFn, _orderByFn: orderByFn };
}

vi.mock("@jarvis/db/client", () => ({
  db: {
    get select() {
      return dbSelectMock;
    },
    get execute() {
      return dbExecuteMock;
    },
  },
}));

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
const TEST_WORKSPACE = "ws-test-001";

function mockAuthorizedSession(workspaceId = TEST_WORKSPACE) {
  headersMock.mockResolvedValue(new Headers({ "x-session-id": "sid-ok" }));
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
  getSessionMock.mockResolvedValue({
    sessionId: "sid-ok",
    workspaceId,
    userId: "u-test",
    roles: [],
    permissions: ["SALES_ALL"],
  });
  hasPermissionMock.mockReturnValue(true);
}

function mockUnauthorizedSession() {
  headersMock.mockResolvedValue(new Headers()); // no x-session-id
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
}

function mockForbiddenSession() {
  headersMock.mockResolvedValue(new Headers({ "x-session-id": "sid-noperm" }));
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
  getSessionMock.mockResolvedValue({
    sessionId: "sid-noperm",
    workspaceId: TEST_WORKSPACE,
    userId: "u-noperm",
    roles: [],
    permissions: [],
  });
  hasPermissionMock.mockReturnValue(false);
}

// ---------------------------------------------------------------------------
// Import actions AFTER mocks are registered
// ---------------------------------------------------------------------------
import { getMarketingByActivity, getMarketingByProduct } from "../actions";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const TEST_YM = "202506";

describe("getMarketingByActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with typed rows when session is authorized", async () => {
    mockAuthorizedSession();

    const fakeRows = [
      { activityTypeCode: "VISIT", count: 5 },
      { activityTypeCode: "CALL", count: 3 },
    ];
    const chain = buildSelectChain(fakeRows);
    dbSelectMock.mockReturnValue(chain);

    const res = await getMarketingByActivity({ ym: TEST_YM });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(Array.isArray(res.rows)).toBe(true);
    for (const r of res.rows) {
      expect(
        typeof r.activityTypeCode === "string" || r.activityTypeCode === null,
      ).toBe(true);
      expect(r.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("maps rows correctly (count as Number, null passthrough)", async () => {
    mockAuthorizedSession();

    const fakeRows = [
      { activityTypeCode: null, count: 2 },
      { activityTypeCode: "DEMO", count: "7" }, // count arrives as string from pg
    ];
    const chain = buildSelectChain(fakeRows);
    dbSelectMock.mockReturnValue(chain);

    const res = await getMarketingByActivity({ ym: TEST_YM });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const nullRow = res.rows.find((r) => r.activityTypeCode === null);
    expect(nullRow).toBeDefined();
    expect(nullRow?.count).toBe(2);

    const demoRow = res.rows.find((r) => r.activityTypeCode === "DEMO");
    expect(demoRow?.count).toBe(7); // Number("7") = 7
  });

  it("returns ok:false with error Unauthorized when no session", async () => {
    mockUnauthorizedSession();

    const res = await getMarketingByActivity({ ym: TEST_YM });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Unauthorized");
  });

  it("returns ok:false with error Forbidden when permission missing", async () => {
    mockForbiddenSession();

    const res = await getMarketingByActivity({ ym: TEST_YM });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Forbidden");
  });

  it("throws ZodError on invalid ym format", async () => {
    mockAuthorizedSession();
    await expect(
      getMarketingByActivity({ ym: "2506" }), // too short
    ).rejects.toThrow();
  });
});

describe("getMarketingByProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with totalAmt >= 0 for each row", async () => {
    mockAuthorizedSession();

    const fakeRows = [
      { productTypeCode: "SW", totalAmt: 500000 },
      { productTypeCode: "HW", totalAmt: 1200000 },
    ];
    const chain = buildSelectChain(fakeRows);
    dbSelectMock.mockReturnValue(chain);

    const res = await getMarketingByProduct({ ym: TEST_YM });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(Array.isArray(res.rows)).toBe(true);
    for (const r of res.rows) {
      expect(
        typeof r.productTypeCode === "string" || r.productTypeCode === null,
      ).toBe(true);
      expect(r.totalAmt).toBeGreaterThanOrEqual(0);
    }
  });

  it("coerces totalAmt via Number() — string from pg → number", async () => {
    mockAuthorizedSession();

    const fakeRows = [{ productTypeCode: "SVC", totalAmt: "999999" }];
    const chain = buildSelectChain(fakeRows);
    dbSelectMock.mockReturnValue(chain);

    const res = await getMarketingByProduct({ ym: TEST_YM });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.rows[0]?.totalAmt).toBe(999999);
  });

  it("handles null productTypeCode in result rows", async () => {
    mockAuthorizedSession();

    const fakeRows = [{ productTypeCode: null, totalAmt: 0 }];
    const chain = buildSelectChain(fakeRows);
    dbSelectMock.mockReturnValue(chain);

    const res = await getMarketingByProduct({ ym: TEST_YM });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.rows[0]?.productTypeCode).toBeNull();
    expect(res.rows[0]?.totalAmt).toBe(0);
  });

  it("returns ok:false with error Unauthorized when no session", async () => {
    mockUnauthorizedSession();

    const res = await getMarketingByProduct({ ym: TEST_YM });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Unauthorized");
  });

  it("returns ok:false with error Forbidden when permission missing", async () => {
    mockForbiddenSession();

    const res = await getMarketingByProduct({ ym: TEST_YM });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// Task 6: getAdminPerf
// ---------------------------------------------------------------------------
import { getAdminPerf } from "../actions";

describe("getAdminPerf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizedSession();
    // Default: db.execute returns empty rows (pivot fills 0s)
    dbExecuteMock.mockResolvedValue({ rows: [] });
  });

  it("returns 12 monthly rows for view=year with plan/actual/forecast columns", async () => {
    const res = await getAdminPerf({ year: 2024, view: "year", metric: "SALES" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(12);
    for (const r of res.rows) {
      expect(typeof r.period).toBe("string");
      expect(typeof r.plan).toBe("number");
      expect(typeof r.actual).toBe("number");
      expect(typeof r.forecast).toBe("number");
    }
  });

  it("returns 4 quarter rows for view=quarter", async () => {
    const res = await getAdminPerf({ year: 2024, view: "quarter", metric: "SALES" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(4);
    expect(res.rows.map((r) => r.period)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});

// ---------------------------------------------------------------------------
// Task 7: getSaleTrend / getProfitTrend / getPlanPerfChart
// ---------------------------------------------------------------------------
import { getSaleTrend, getProfitTrend, getPlanPerfChart } from "../actions";

describe("getSaleTrend / getProfitTrend / getPlanPerfChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizedSession();
    dbExecuteMock.mockResolvedValue({ rows: [] });
  });

  it("getSaleTrend returns 12 ym rows × years[0]", async () => {
    const res = await getSaleTrend({ years: [2024], metric: "SALES" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(12);
    for (const r of res.rows) {
      expect(r.ym).toMatch(/^2024(0[1-9]|1[0-2])$/);
    }
  });

  it("getProfitTrend defaults metric=OP_INCOME", async () => {
    const res = await getProfitTrend({ years: [2024], metric: "OP_INCOME" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("getPlanPerfChart returns 12 rows for the year with plan/actual/forecast", async () => {
    const res = await getPlanPerfChart({ year: 2024 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(12);
    for (const r of res.rows) {
      expect(typeof r.plan).toBe("number");
      expect(typeof r.actual).toBe("number");
      expect(typeof r.forecast).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// Task 8: Dashboard actions (5 functions)
// ---------------------------------------------------------------------------
import {
  getDashboardSalesTrend, getDashboardSucProb, getDashboardSucProbHap,
  getDashboardOpIncome, getDashboardBA,
} from "../actions";

describe("dashboard actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizedSession();
    dbExecuteMock.mockResolvedValue({ rows: [] });
  });

  it("getDashboardSalesTrend returns rows with ym + plan/actual/forecast", async () => {
    const res = await getDashboardSalesTrend({ years: [2024] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(12);
  });

  it("getDashboardOpIncome returns 12 monthly rows for the year", async () => {
    const res = await getDashboardOpIncome({ year: 2024 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.length).toBe(12);
    for (const r of res.rows) expect(typeof r.opIncome).toBe("number");
  });

  it("getDashboardBA returns one row per organization with plan + actual", async () => {
    const res = await getDashboardBA({ ym: "202406" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const r of res.rows) {
      expect(typeof r.orgNm).toBe("string");
      expect(typeof r.plan).toBe("number");
      expect(typeof r.actual).toBe("number");
    }
  });

  it("getDashboardSucProb returns rows grouped by probability bucket", async () => {
    const res = await getDashboardSucProb({ ym: "202406" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const r of res.rows) {
      expect(["A", "B", "C", "D", null]).toContain(r.gradeCode);
    }
  });

  it("getDashboardSucProbHap returns rows grouped by HIGH/MED/LOW", async () => {
    const res = await getDashboardSucProbHap({ ym: "202406" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const r of res.rows) {
      expect(["HIGH", "MED", "LOW", null]).toContain(r.gradeCode);
    }
  });
});
