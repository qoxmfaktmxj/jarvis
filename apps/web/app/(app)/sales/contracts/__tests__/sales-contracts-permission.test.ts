import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies — available in vi.mock factory closures (hoisting boundary).
// ---------------------------------------------------------------------------
const { whereSpy, countWhereSpy, offsetMock, limitSelectMock, insertSpy, updateSpy, deleteSpy, transactionSpy } = vi.hoisted(() => {
  // Count query chain: .select({count}).from().where() → [{count: N}]
  const countWhereSpy = vi.fn().mockResolvedValue([{ count: 2 }]);

  // Select rows chain: .select().from().where().orderBy().limit().offset()
  const offsetMock = vi.fn().mockResolvedValue([]);
  const limitSelectMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const orderByMock = vi.fn().mockReturnValue({ limit: limitSelectMock });
  const whereSpy = vi.fn().mockReturnValue({ orderBy: orderByMock });

  // insert / update / delete returning chains
  const returningInsertMock = vi.fn().mockResolvedValue([{ id: "new-id-1" }]);
  const valuesInsertMock = vi.fn().mockReturnValue({ returning: returningInsertMock });
  const insertSpy = vi.fn().mockReturnValue({ values: valuesInsertMock });

  const returningUpdateMock = vi.fn().mockResolvedValue([{ id: "upd-id-1" }]);
  const whereUpdateMock = vi.fn().mockReturnValue({ returning: returningUpdateMock });
  const setMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
  const updateSpy = vi.fn().mockReturnValue({ set: setMock });

  const returningDeleteMock = vi.fn().mockResolvedValue([{ id: "del-id-1" }]);
  const whereDeleteMock = vi.fn().mockReturnValue({ returning: returningDeleteMock });
  const deleteSpy = vi.fn().mockReturnValue({ where: whereDeleteMock });

  // transaction: executes the callback immediately with a tx proxy
  const transactionSpy = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { insert: insertSpy, update: updateSpy, delete: deleteSpy };
    return cb(tx);
  });

  return {
    whereSpy,
    countWhereSpy,
    offsetMock,
    limitSelectMock,
    insertSpy,
    updateSpy,
    deleteSpy,
    transactionSpy,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn((fields?: unknown) => {
      // discriminate: count query uses select({count:count()}) object, rows use select()
      if (fields && typeof fields === "object") {
        return { from: vi.fn().mockReturnValue({ where: countWhereSpy }) };
      }
      return { from: vi.fn().mockReturnValue({ where: whereSpy }) };
    }),
    transaction: transactionSpy,
  },
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "u-test-1",
    workspaceId: "ws-test-1",
    employeeId: "E001",
    permissions: ["sales:all"],
    roles: [],
    id: "sess-1",
    expiresAt: Date.now() + 3_600_000,
  }),
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (k: string) => (k === "x-session-id" ? "test-session" : null),
  }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { listContracts, saveContracts } from "../actions";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// listContracts
// ---------------------------------------------------------------------------

describe("listContracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "u-test-1",
      workspaceId: "ws-test-1",
      employeeId: "E001",
      permissions: ["sales:all"],
      roles: [],
      id: "sess-1",
      expiresAt: Date.now() + 3_600_000,
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    countWhereSpy.mockResolvedValue([{ count: 2 }]);
    offsetMock.mockResolvedValue([]);
    limitSelectMock.mockReturnValue({ offset: offsetMock });
  });

  it("rejects with Forbidden when SALES_ALL permission is missing", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);

    const result = await listContracts({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("rejects with Unauthorized when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await listContracts({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns rows and total when SALES_ALL is granted", async () => {
    const fakeRow = {
      id: "contract-id-1",
      workspaceId: "ws-test-1",
      contNm: "테스트 계약",
      companyNm: "테스트 회사",
      legacyContNo: "2024-001",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
      legacyEnterCd: null, legacyContYear: null, companyType: null, companyCd: null,
      companyGrpNm: null, companyNo: null, customerNo: null, customerEmail: null,
      custNm: null, contGbCd: null, contYmd: null, contSymd: null, contEymd: null,
      mainContType: null, newYn: null, inOutType: null, startAmt: null,
      startAmtRate: null, interimAmt1: null, interimAmt2: null, interimAmt3: null,
      interimAmt4: null, interimAmt5: null, interimAmtRate1: null, interimAmtRate2: null,
      interimAmtRate3: null, interimAmtRate4: null, interimAmtRate5: null,
      remainAmt: null, remainAmtRate: null, contImplYn: null, contPublYn: null,
      contGrtRate: null, advanImplYn: null, advanPublYn: null, advanGrtRate: null,
      defectImplYn: null, defectPublYn: null, defectGrtRate: null, defectEymd: null,
      inspecConfYmd: null, startAmtPlanYmd: null, startAmtPublYn: null,
      interimAmtPlanYmd1: null, interimAmtPublYn1: null, interimAmtPlanYmd2: null,
      interimAmtPublYn2: null, interimAmtPlanYmd3: null, interimAmtPublYn3: null,
      interimAmtPlanYmd4: null, interimAmtPublYn4: null, interimAmtPlanYmd5: null,
      interimAmtPublYn5: null, remainAmtPlanYmd: null, remainAmtPublYn: null,
      befContNo: null, contCancelYn: null, contInitYn: null, fileSeq: null,
      docNo: null, companyAddr: null, companyOner: null, sucProb: null, memo: null,
    };

    offsetMock.mockResolvedValueOnce([fakeRow]);
    countWhereSpy.mockResolvedValueOnce([{ count: 1 }]);

    const result = await listContracts({ page: 1, limit: 50 });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("contract-id-1");
    expect(result.total).toBe(1);
  });

  it("filters by workspaceId (whereSpy receives composed and() argument)", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      userId: "u-ws-check",
      workspaceId: "ws-specific-xyz",
      employeeId: "E999",
      permissions: ["sales:all"],
      roles: [],
      id: "sess-ws",
      expiresAt: Date.now() + 3_600_000,
    } as never);

    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContracts({ page: 1, limit: 10 });

    // whereSpy receives a composed and(...) SQL node — single argument
    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// saveContracts
// ---------------------------------------------------------------------------

describe("saveContracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "u-test-1",
      workspaceId: "ws-test-1",
      employeeId: "E001",
      permissions: ["sales:all"],
      roles: [],
      id: "sess-1",
      expiresAt: Date.now() + 3_600_000,
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // Re-wire spy chains after clearAllMocks
    const returningInsertMock = vi.fn().mockResolvedValue([{ id: "new-id-1" }]);
    const valuesInsertMock = vi.fn().mockReturnValue({ returning: returningInsertMock });
    insertSpy.mockReturnValue({ values: valuesInsertMock });

    const returningUpdateMock = vi.fn().mockResolvedValue([{ id: "upd-id-1" }]);
    const whereUpdateMock = vi.fn().mockReturnValue({ returning: returningUpdateMock });
    const setMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
    updateSpy.mockReturnValue({ set: setMock });

    const returningDeleteMock = vi.fn().mockResolvedValue([{ id: "del-id-1" }]);
    const whereDeleteMock = vi.fn().mockReturnValue({ returning: returningDeleteMock });
    deleteSpy.mockReturnValue({ where: whereDeleteMock });

    transactionSpy.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = { insert: insertSpy, update: updateSpy, delete: deleteSpy };
      return cb(tx);
    });
  });

  it("rejects with UNAUTHORIZED error when SALES_ALL permission is missing", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);

    const result = await saveContracts({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("rejects with UNAUTHORIZED error when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await saveContracts({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("inserts new contracts scoped to workspaceId and writes audit_log", async () => {
    // Capture the values mock from the hoisted insertSpy chain so we can inspect
    // all .values() calls (both salesContract and auditLog use the same spy chain).
    const capturedValuesArgs: unknown[][] = [];
    const valuesCapture = vi.fn((...args: unknown[]) => {
      capturedValuesArgs.push(args);
      return { returning: vi.fn().mockResolvedValue([{ id: "new-id-1" }]) };
    });
    insertSpy.mockReturnValue({ values: valuesCapture });

    const result = await saveContracts({
      creates: [{ contNm: "신규 계약 1" }],
      updates: [],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);

    // insert called twice: once for salesContract rows, once for auditLog rows
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(capturedValuesArgs).toHaveLength(2);

    // First .values() call: salesContract — includes workspaceId
    const firstValues = capturedValuesArgs[0]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(firstValues)).toBe(true);
    expect(firstValues[0]).toMatchObject({ workspaceId: "ws-test-1" });

    // Second .values() call: auditLog
    const secondValues = capturedValuesArgs[1]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(secondValues)).toBe(true);
    expect(secondValues[0]).toMatchObject({
      action: "sales.contract.create",
      resourceType: "sales_contract",
      success: true,
    });
  });

  it("updates contracts scoped to workspaceId and writes audit_log", async () => {
    const result = await saveContracts({
      creates: [],
      updates: [{ id: "00000000-0000-0000-0000-000000000001", contNm: "수정 계약" }],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledOnce();

    expect(insertSpy).toHaveBeenCalledOnce();
    const auditInsertValues = insertSpy.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(auditInsertValues).toMatchObject({
      action: "sales.contract.update",
      resourceType: "sales_contract",
      workspaceId: "ws-test-1",
    });
  });

  it("deletes contracts scoped to workspaceId and writes audit_log", async () => {
    const result = await saveContracts({
      creates: [],
      updates: [],
      deletes: ["00000000-0000-0000-0000-000000000002"],
    });

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(1);
    expect(deleteSpy).toHaveBeenCalledOnce();

    expect(insertSpy).toHaveBeenCalledOnce();
    const auditValues = insertSpy.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(Array.isArray(auditValues)).toBe(true);
    expect(auditValues[0]).toMatchObject({
      action: "sales.contract.delete",
      resourceType: "sales_contract",
      workspaceId: "ws-test-1",
    });
  });

  it("calls revalidatePath('/sales/contracts') after mutation", async () => {
    await saveContracts({ creates: [], updates: [], deletes: [] });
    expect(revalidatePath).toHaveBeenCalledWith("/sales/contracts");
  });

  it("wraps all mutations in a transaction", async () => {
    await saveContracts({
      creates: [{ contNm: "트랜잭션 테스트" }],
      updates: [],
      deletes: [],
    });

    expect(transactionSpy).toHaveBeenCalledOnce();
  });
});
