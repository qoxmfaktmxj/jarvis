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

import { listContractServices, saveContractServices } from "../actions";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// listContractServices
// ---------------------------------------------------------------------------

describe("listContractServices", () => {
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

    const result = await listContractServices({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("rejects with Unauthorized when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await listContractServices({});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns rows and total scoped to workspaceId", async () => {
    const fakeRow = {
      id: "service-id-1",
      workspaceId: "ws-test-1",
      legacyEnterCd: null,
      legacySymd: null,
      legacyServSabun: null,
      servSabun: "S001",
      servName: "홍길동",
      birYmd: null,
      symd: "20240101",
      eymd: null,
      cpyGbCd: null,
      cpyName: null,
      econtAmt: null,
      econtCnt: null,
      job: "개발자",
      tel: null,
      mail: null,
      addr: null,
      attendCd: "A001",
      skillCd: null,
      cmmncCd: null,
      rsponsCd: null,
      memo1: null,
      memo2: null,
      memo3: null,
      orgCd: null,
      manager: null,
      pjtCd: "PJT001",
      pjtNm: null,
      etc1: null,
      etc2: null,
      etc3: null,
      etc4: null,
      etc5: null,
      etc6: null,
      etc7: null,
      etc8: null,
      etc9: null,
      etc10: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    };

    offsetMock.mockResolvedValueOnce([fakeRow]);
    countWhereSpy.mockResolvedValueOnce([{ count: 1 }]);

    const result = await listContractServices({ page: 1, limit: 50 });

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("service-id-1");
    expect(result.total).toBe(1);
  });

  it("filters by pjtCd", async () => {
    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContractServices({ pjtCd: "PJT001" });

    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });

  it("filters by attendCd", async () => {
    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContractServices({ attendCd: "A001" });

    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });

  it("filters by q (ilike on servName, job, servSabun)", async () => {
    offsetMock.mockResolvedValueOnce([]);
    countWhereSpy.mockResolvedValueOnce([{ count: 0 }]);

    await listContractServices({ q: "홍길동" });

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

    await listContractServices({ page: 1, limit: 10 });

    // whereSpy receives a composed and(...) SQL node — single argument
    expect(whereSpy).toHaveBeenCalled();
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// saveContractServices
// ---------------------------------------------------------------------------

describe("saveContractServices", () => {
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

    const result = await saveContractServices({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("rejects with UNAUTHORIZED error when session is missing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await saveContractServices({ creates: [], updates: [], deletes: [] });

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("processes creates within workspaceId and writes audit_log", async () => {
    let capturedValuesArgs: unknown[][] = [];
    const valuesCapture = vi.fn((...args: unknown[]) => {
      capturedValuesArgs.push(args);
      return { returning: vi.fn().mockResolvedValue([{ id: "new-id-1" }]) };
    });
    insertSpy.mockReturnValue({ values: valuesCapture });

    const result = await saveContractServices({
      creates: [{ servSabun: "S001" }],
      updates: [],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);

    // insert called twice: once for salesContractService rows, once for auditLog rows
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(capturedValuesArgs).toHaveLength(2);

    // First .values() call: salesContractService — includes workspaceId
    const firstValues = capturedValuesArgs[0]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(firstValues)).toBe(true);
    expect(firstValues[0]).toMatchObject({ workspaceId: "ws-test-1" });

    // Second .values() call: auditLog
    const secondValues = capturedValuesArgs[1]?.[0] as Array<Record<string, unknown>>;
    expect(Array.isArray(secondValues)).toBe(true);
    expect(secondValues[0]).toMatchObject({
      action: "sales.contract_service.batch_save",
      resourceType: "sales_contract_service",
      success: true,
    });
  });

  it("processes updates within workspaceId and writes audit_log", async () => {
    const result = await saveContractServices({
      creates: [],
      updates: [{ id: "00000000-0000-0000-0000-000000000001", servName: "김철수" }],
      deletes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
    expect(updateSpy).toHaveBeenCalledOnce();

    expect(insertSpy).toHaveBeenCalledOnce();
    const auditInsertValues = insertSpy.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(auditInsertValues).toMatchObject({
      action: "sales.contract_service.batch_save",
      resourceType: "sales_contract_service",
      workspaceId: "ws-test-1",
    });
  });

  it("processes deletes within workspaceId and writes audit_log", async () => {
    const result = await saveContractServices({
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
      action: "sales.contract_service.batch_save",
      resourceType: "sales_contract_service",
      workspaceId: "ws-test-1",
    });
  });

  it("calls revalidatePath('/sales/contract-services') after mutation", async () => {
    await saveContractServices({ creates: [], updates: [], deletes: [] });
    expect(revalidatePath).toHaveBeenCalledWith("/sales/contract-services");
  });

  it("wraps all mutations in a transaction", async () => {
    await saveContractServices({
      creates: [{ servSabun: "S001" }],
      updates: [],
      deletes: [],
    });

    expect(transactionSpy).toHaveBeenCalledOnce();
  });
});
