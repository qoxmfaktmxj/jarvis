import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies — available in vi.mock factory closures (hoisting boundary).
// ---------------------------------------------------------------------------
const { whereSpy, countWhereSpy, offsetMock, limitSelectMock, limitSingleMock, insertSpy, updateSpy, deleteSpy, transactionSpy } = vi.hoisted(() => {
  // Count query chain: .select({count}).from().where() → [{count: N}]
  const countWhereSpy = vi.fn().mockResolvedValue([{ count: 2 }]);

  // Single-row chain: .select().from().where().limit(1) → []
  // Used by getContractMonth which does NOT call .orderBy().
  const limitSingleMock = vi.fn().mockResolvedValue([]);

  // List rows chain: .select().from().where().orderBy().limit().offset()
  const offsetMock = vi.fn().mockResolvedValue([]);
  const limitSelectMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const orderByMock = vi.fn().mockReturnValue({ limit: limitSelectMock });
  // whereSpy must expose both .orderBy (list) and .limit (single-row fetch)
  const whereSpy = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitSingleMock });

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
    limitSingleMock,
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

import { getContractMonth, listContractMonths, saveContractMonths } from "../actions";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// getContractMonth
// ---------------------------------------------------------------------------

describe("getContractMonth", () => {
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
    // Re-wire whereSpy return after clearAllMocks
    whereSpy.mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }) }), limit: limitSingleMock });
    limitSingleMock.mockResolvedValue([]);
    offsetMock.mockResolvedValue([]);
  });

  it("returns null when row is missing", async () => {
    limitSingleMock.mockResolvedValueOnce([]);

    const result = await getContractMonth({ id: "00000000-0000-0000-0000-000000000001" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contractMonth).toBeNull();
    }
  });

  it("returns contractMonth scoped to workspace", async () => {
    const MONTH_UUID = "a0000000-0000-0000-0000-000000000001";
    const CONTRACT_UUID = "b0000000-0000-0000-0000-000000000001";
    const fakeRow = {
      id: MONTH_UUID,
      workspaceId: "ws-test-1",
      contractId: CONTRACT_UUID,
      legacyContYear: null,
      legacyContNo: null,
      legacySeq: null,
      legacyYm: null,
      ym: "202401",
      billTargetYn: null,
      planInManMonth: null, planOutManMonth: null,
      planServSaleAmt: null, planProdSaleAmt: null, planInfSaleAmt: null,
      planServInCostAmt: null, planServOutCostAmt: null, planProdCostAmt: null,
      planInCostAmt: null, planOutCostAmt: null, planIndirectGrpAmt: null,
      planIndirectComAmt: null, planRentAmt: null, planSgaAmt: null, planExpAmt: null,
      viewInManMonth: null, viewOutManMonth: null,
      viewServSaleAmt: null, viewProdSaleAmt: null, viewInfSaleAmt: null,
      viewServInCostAmt: null, viewServOutCostAmt: null, viewProdCostAmt: null,
      viewInCostAmt: null, viewOutCostAmt: null, viewIndirectGrpAmt: null,
      viewIndirectComAmt: null, viewRentAmt: null, viewSgaAmt: null, viewExpAmt: null,
      perfInManMonth: null, perfOutManMonth: null,
      perfServSaleAmt: null, perfProdSaleAmt: null, perfInfSaleAmt: null,
      perfServInCostAmt: null, perfServOutCostAmt: null, perfProdCostAmt: null,
      perfInCostAmt: null, perfOutCostAmt: null, perfIndirectGrpAmt: null,
      perfIndirectComAmt: null, perfRentAmt: null, perfSgaAmt: null, perfExpAmt: null,
      taxOrderAmt: null, taxServAmt: null,
      rfcEndYn: "N",
      note: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    };

    limitSingleMock.mockResolvedValueOnce([fakeRow]);

    const result = await getContractMonth({ id: MONTH_UUID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contractMonth?.id).toBe(MONTH_UUID);
      expect(result.contractMonth?.ym).toBe("202401");
    }
  });

  it("rejects without SALES_ALL permission", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);

    const result = await getContractMonth({ id: "00000000-0000-0000-0000-000000000001" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Forbidden");
    }
  });

  it("rejects when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await getContractMonth({ id: "00000000-0000-0000-0000-000000000001" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unauthorized");
    }
  });
});

// ---------------------------------------------------------------------------
// listContractMonths
// ---------------------------------------------------------------------------

describe("listContractMonths", () => {
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
    // Re-wire whereSpy and limitSingleMock after clearAllMocks
    limitSingleMock.mockResolvedValue([]);
    whereSpy.mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: limitSelectMock }), limit: limitSingleMock });
  });

  it("rejects with Forbidden when SALES_ALL permission is missing", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);

    const result = await listContractMonths({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("rejects with Unauthorized when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await listContractMonths({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns rows and total scoped to workspaceId", async () => {
    const fakeRow = {
      id: "month-id-1",
      workspaceId: "ws-test-1",
      contractId: "contract-id-1",
      legacyContYear: null,
      legacyContNo: null,
      legacySeq: null,
      legacyYm: null,
      ym: "202401",
      billTargetYn: null,
      planInManMonth: null, planOutManMonth: null,
      planServSaleAmt: null, planProdSaleAmt: null, planInfSaleAmt: null,
      planServInCostAmt: null, planServOutCostAmt: null, planProdCostAmt: null,
      planInCostAmt: null, planOutCostAmt: null, planIndirectGrpAmt: null,
      planIndirectComAmt: null, planRentAmt: null, planSgaAmt: null, planExpAmt: null,
      viewInManMonth: null, viewOutManMonth: null,
      viewServSaleAmt: null, viewProdSaleAmt: null, viewInfSaleAmt: null,
      viewServInCostAmt: null, viewServOutCostAmt: null, viewProdCostAmt: null,
      viewInCostAmt: null, viewOutCostAmt: null, viewIndirectGrpAmt: null,
      viewIndirectComAmt: null, viewRentAmt: null, viewSgaAmt: null, viewExpAmt: null,
      perfInManMonth: null, perfOutManMonth: null,
      perfServSaleAmt: null, perfProdSaleAmt: null, perfInfSaleAmt: null,
      perfServInCostAmt: null, perfServOutCostAmt: null, perfProdCostAmt: null,
      perfInCostAmt: null, perfOutCostAmt: null, perfIndirectGrpAmt: null,
      perfIndirectComAmt: null, perfRentAmt: null, perfSgaAmt: null, perfExpAmt: null,
      taxOrderAmt: null, taxServAmt: null,
      rfcEndYn: "N",
      note: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    };

    offsetMock.mockResolvedValueOnce([fakeRow]);
    countWhereSpy.mockResolvedValueOnce([{ count: 1 }]);

    const result = await listContractMonths({ page: 1, limit: 50 });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("month-id-1");
    expect(result.total).toBe(1);
  });

  it("filters by contractId", async () => {
    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContractMonths({ contractId: "00000000-0000-0000-0000-000000000001" });

    expect(whereSpy).toHaveBeenCalled();
    // whereSpy receives composed and(...) with workspaceId + contractId filters
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });

  it("filters by ym", async () => {
    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContractMonths({ ym: "202401" });

    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
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

    await listContractMonths({ page: 1, limit: 10 });

    // whereSpy receives a composed and(...) SQL node — single argument
    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// saveContractMonths
// ---------------------------------------------------------------------------

describe("saveContractMonths", () => {
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

    const result = await saveContractMonths({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("rejects with UNAUTHORIZED error when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await saveContractMonths({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("processes creates within workspaceId and writes audit_log", async () => {
    const capturedValuesArgs: unknown[][] = [];
    const valuesCapture = vi.fn((...args: unknown[]) => {
      capturedValuesArgs.push(args);
      return { returning: vi.fn().mockResolvedValue([{ id: "new-id-1" }]) };
    });
    insertSpy.mockReturnValue({ values: valuesCapture });

    const result = await saveContractMonths({
      creates: [{ contractId: "00000000-0000-0000-0000-000000000001", ym: "202401" }],
      updates: [],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);

    // insert called twice: once for salesContractMonth rows, once for auditLog rows
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(capturedValuesArgs).toHaveLength(2);

    // First .values() call: salesContractMonth — includes workspaceId
    const firstValues = capturedValuesArgs[0]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(firstValues)).toBe(true);
    expect(firstValues[0]).toMatchObject({ workspaceId: "ws-test-1" });

    // Second .values() call: auditLog
    const secondValues = capturedValuesArgs[1]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(secondValues)).toBe(true);
    expect(secondValues[0]).toMatchObject({
      action: "sales.contract_month.batch_save",
      resourceType: "sales_contract_month",
      success: true,
    });
  });

  it("processes updates within workspaceId and writes audit_log", async () => {
    const result = await saveContractMonths({
      creates: [],
      updates: [{ id: "00000000-0000-0000-0000-000000000001", ym: "202402" }],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledOnce();

    expect(insertSpy).toHaveBeenCalledOnce();
    const auditInsertValues = insertSpy.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(auditInsertValues).toMatchObject({
      action: "sales.contract_month.batch_save",
      resourceType: "sales_contract_month",
      workspaceId: "ws-test-1",
    });
  });

  it("processes deletes within workspaceId and writes audit_log", async () => {
    const result = await saveContractMonths({
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
      action: "sales.contract_month.batch_save",
      resourceType: "sales_contract_month",
      workspaceId: "ws-test-1",
    });
  });

  it("calls revalidatePath('/sales/contract-months') after mutation", async () => {
    await saveContractMonths({ creates: [], updates: [], deletes: [] });
    expect(revalidatePath).toHaveBeenCalledWith("/sales/contract-months");
  });

  it("wraps all mutations in a transaction", async () => {
    await saveContractMonths({
      creates: [{ contractId: "00000000-0000-0000-0000-000000000001", ym: "202401" }],
      updates: [],
      deletes: [],
    });

    expect(transactionSpy).toHaveBeenCalledOnce();
  });
});
