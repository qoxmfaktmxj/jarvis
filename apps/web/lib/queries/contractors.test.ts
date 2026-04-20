import { describe, expect, it, vi } from "vitest";
import {
  createContractor,
  createLeaveRequest,
  cancelLeaveRequest,
  computeRemainingHours,
  listContractors,
  renewContract,
  terminateContract,
  deleteLeaveRequest,
  updateContract,
  updateLeaveRequest,
} from "./contractors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChainDatabase(resolveWith: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "insert",
    "values",
    "returning",
    "delete",
    "update",
    "set",
    "groupBy",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  (chain as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (
    resolve
  ) => Promise.resolve(resolve(resolveWith));
  return chain;
}

function makeTwoSelectDatabase(firstRows: unknown[], secondRows: unknown[]) {
  const db = { select: vi.fn() };
  db.select
    .mockReturnValueOnce(makeChainDatabase(firstRows))
    .mockReturnValueOnce(makeChainDatabase(secondRows));
  return db;
}

function makeSelectDatabase(resolveWith: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveWith),
    groupBy: vi.fn().mockReturnThis(),
  };
  return { select: vi.fn().mockReturnValue(chain) };
}

function makeUpdateDatabase(returnRows: unknown[]) {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnRows),
  };
  return {
    db: { update: vi.fn().mockReturnValue(updateChain) },
    updateChain,
  };
}

function makeDeleteDatabase(returnRows: unknown[]) {
  const deleteChain = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnRows),
  };
  return {
    db: { delete: vi.fn().mockReturnValue(deleteChain) },
    deleteChain,
  };
}

// ---------------------------------------------------------------------------
// createContractor
// ---------------------------------------------------------------------------

describe("createContractor", () => {
  it("inserts user with employmentType=contractor + active contract", async () => {
    const createdUser = {
      id: "user-1",
      workspaceId: "ws-1",
      employeeId: "C001",
      name: "홍길동",
      employmentType: "contractor",
    };
    const createdContract = {
      id: "contract-1",
      workspaceId: "ws-1",
      userId: "user-1",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      generatedLeaveHours: "16",
      additionalLeaveHours: "0",
      status: "active",
    };

    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn()
        .mockResolvedValueOnce([createdUser])
        .mockResolvedValueOnce([createdContract]),
    };
    const txMock = {
      insert: vi.fn().mockReturnValue(insertChain),
    };
    const dbMock = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(txMock)),
    };

    const result = await createContractor({
      workspaceId: "ws-1",
      input: {
        name: "홍길동",
        employeeId: "C001",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      },
      actorId: "actor-1",
      database: dbMock as never,
    });

    expect(result.user.id).toBe("user-1");
    expect(result.contract.status).toBe("active");

    // user insert에 employmentType: "contractor" 전달 확인
    const firstInsertValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(firstInsertValues).toMatchObject({ employmentType: "contractor" });
  });
});

// ---------------------------------------------------------------------------
// listContractors
// ---------------------------------------------------------------------------

describe("listContractors", () => {
  it("returns data with issuedHours/usedHours/remainingHours computed", async () => {
    const userRows = [
      {
        userId: "user-1",
        employeeId: "C001",
        name: "홍길동",
        orgName: "본사",
        contractId: "contract-1",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        generatedLeaveHours: "16",
        additionalLeaveHours: "4",
        contractStatus: "active",
        userUpdatedAt: new Date("2026-01-01"),
      },
    ];

    // listContractors uses 3 sequential selects:
    // 1. rows query (leftJoin)
    // 2. usedHours query (groupBy)
    // 3. count query
    const usedRows = [{ contractId: "contract-1", used: "8" }];
    const countRows = [{ total: "1" }];

    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(makeChainDatabase(userRows))
      .mockReturnValueOnce(makeChainDatabase(usedRows))
      .mockReturnValueOnce(makeChainDatabase(countRows));

    const result = await listContractors({
      workspaceId: "ws-1",
      database: db as never,
    });

    expect(result.data).toHaveLength(1);
    const row = result.data[0]!;
    expect(row.issuedHours).toBe(20); // 16 + 4
    expect(row.usedHours).toBe(8);
    expect(row.remainingHours).toBe(12); // 20 - 8
    expect(result.pagination.total).toBe(1);
  });

  it("returns remainingHours=issuedHours when no used leave", async () => {
    const userRows = [
      {
        userId: "user-2",
        employeeId: "C002",
        name: "김철수",
        orgName: null,
        contractId: "contract-2",
        startDate: "2026-03-01",
        endDate: "2026-08-31",
        generatedLeaveHours: "24",
        additionalLeaveHours: "0",
        contractStatus: "active",
        userUpdatedAt: new Date("2026-03-01"),
      },
    ];

    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(makeChainDatabase(userRows))
      .mockReturnValueOnce(makeChainDatabase([])) // no used rows
      .mockReturnValueOnce(makeChainDatabase([{ total: "1" }]));

    const result = await listContractors({
      workspaceId: "ws-1",
      database: db as never,
    });

    expect(result.data[0]!.remainingHours).toBe(24);
    expect(result.data[0]!.usedHours).toBe(0);
  });

  it("paginates correctly", async () => {
    // contractIds is empty (no rows) → usedRows query is skipped
    // select calls: 1=rows, 2=count
    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(makeChainDatabase([])) // rows
      .mockReturnValueOnce(makeChainDatabase([{ total: "100" }])); // count

    const result = await listContractors({
      workspaceId: "ws-1",
      page: 3,
      pageSize: 10,
      database: db as never,
    });

    expect(result.pagination.page).toBe(3);
    expect(result.pagination.pageSize).toBe(10);
    expect(result.pagination.total).toBe(100);
    expect(result.pagination.totalPages).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// computeRemainingHours
// ---------------------------------------------------------------------------

describe("computeRemainingHours", () => {
  it("returns generated + additional − approved leave hours", async () => {
    const contractRow = {
      id: "contract-1",
      generatedLeaveHours: "16",
      additionalLeaveHours: "4",
    };
    const sumRow = { s: "8" };

    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(makeChainDatabase([contractRow]))
      .mockReturnValueOnce(makeChainDatabase([sumRow]));

    const remaining = await computeRemainingHours({
      contractId: "contract-1",
      database: db as never,
    });

    expect(remaining).toBe(12); // 20 - 8
  });

  it("returns 0 when contract not found", async () => {
    // computeRemainingHours does: select().from(contractorContract).where(...)
    // → resolves array via the chain's .then()
    const db = { select: vi.fn().mockReturnValueOnce(makeChainDatabase([])) };

    const remaining = await computeRemainingHours({
      contractId: "nonexistent",
      database: db as never,
    });

    expect(remaining).toBe(0);
  });

  it("cancelled leave is not counted (only approved)", async () => {
    // SQL WHERE status='approved' is applied — mock returns approved sum only
    const contractRow = { id: "c-1", generatedLeaveHours: "16", additionalLeaveHours: "0" };
    const sumRow = { s: "0" }; // cancelled not summed

    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(makeChainDatabase([contractRow]))
      .mockReturnValueOnce(makeChainDatabase([sumRow]));

    const remaining = await computeRemainingHours({
      contractId: "c-1",
      database: db as never,
    });

    expect(remaining).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// createLeaveRequest
// ---------------------------------------------------------------------------

describe("createLeaveRequest", () => {
  it("auto-selects active contract and inserts leave", async () => {
    const activeContract = {
      id: "contract-1",
      workspaceId: "ws-1",
      userId: "user-1",
      status: "active",
    };
    const createdLeave = {
      id: "leave-1",
      contractId: "contract-1",
      type: "day_off",
      startDate: "2026-02-03",
      endDate: "2026-02-03",
      hours: "8",
      status: "approved",
    };

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([activeContract]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([createdLeave]),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
    };

    const result = await createLeaveRequest({
      workspaceId: "ws-1",
      userId: "user-1",
      input: {
        type: "day_off",
        startDate: "2026-02-03",
        endDate: "2026-02-03",
      },
      actorId: "actor-1",
      holidays: new Set(["2026-02-03"]), // 2026-02-03 is holiday → 0h
      database: db as never,
    });

    expect(result.id).toBe("leave-1");
    expect(result.contractId).toBe("contract-1");
  });

  it("throws NO_ACTIVE_CONTRACT when no active contract exists", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no contract
    };
    const db = { select: vi.fn().mockReturnValue(selectChain) };

    await expect(
      createLeaveRequest({
        workspaceId: "ws-1",
        userId: "user-99",
        input: { type: "day_off", startDate: "2026-02-03", endDate: "2026-02-03" },
        actorId: "actor-1",
        holidays: new Set(),
        database: db as never,
      })
    ).rejects.toMatchObject({ code: "NO_ACTIVE_CONTRACT" });
  });

  it("computes hours via computeLeaveHours with holidays passed in", async () => {
    const activeContract = { id: "contract-1", status: "active" };
    const holidays = new Set<string>(); // no holidays → full workday
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([activeContract]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "leave-2", hours: "8" }]),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
    };

    await createLeaveRequest({
      workspaceId: "ws-1",
      userId: "user-1",
      input: { type: "day_off", startDate: "2026-02-03", endDate: "2026-02-03" }, // Monday
      actorId: "actor-1",
      holidays,
      database: db as never,
    });

    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    // 2026-02-03 is Tuesday → 1 workday → 8h
    expect(insertedValues).toMatchObject({ hours: "8" });
  });
});

// ---------------------------------------------------------------------------
// cancelLeaveRequest
// ---------------------------------------------------------------------------

describe("cancelLeaveRequest", () => {
  it("sets status=cancelled and cancelledAt", async () => {
    const cancelledRow = {
      id: "leave-1",
      status: "cancelled",
      cancelledAt: new Date("2026-04-01"),
    };
    const { db, updateChain } = makeUpdateDatabase([cancelledRow]);

    const result = await cancelLeaveRequest({
      workspaceId: "ws-1",
      id: "leave-1",
      database: db as never,
    });

    expect(result?.status).toBe("cancelled");
    expect(result?.cancelledAt).toBeInstanceOf(Date);

    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toMatchObject({ status: "cancelled" });
    expect(setArgs.cancelledAt).toBeInstanceOf(Date);
  });

  it("returns null when leave not found or not in approved status", async () => {
    const { db } = makeUpdateDatabase([]);

    const result = await cancelLeaveRequest({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renewContract
// ---------------------------------------------------------------------------

describe("renewContract", () => {
  it("expires prev contract and creates new with carry-over additional hours", async () => {
    const prevContract = {
      id: "contract-prev",
      workspaceId: "ws-1",
      userId: "user-1",
      status: "active",
      enterCd: "ECD01",
      generatedLeaveHours: "16",
      additionalLeaveHours: "8",
    };
    const newContract = {
      id: "contract-new",
      workspaceId: "ws-1",
      userId: "user-1",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-12-31",
    };

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...prevContract, status: "expired" }]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([newContract]),
    };

    // tx.select() calls inside renewContract:
    // 1. fetch prev contract: select().from().where().limit()
    // 2. computeRemainingHours → fetch contract: select().from().where() (chain resolves)
    // 3. computeRemainingHours → sum leaves: select({ s }).from().where() (chain resolves)
    let selectCallCount = 0;
    const txMock = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // fetch prev: .from().where().limit() → resolves [prevContract]
          const chain = makeChainDatabase([prevContract]);
          return chain;
        }
        if (selectCallCount === 2) {
          // computeRemainingHours: fetch contract → [prevContract]
          return makeChainDatabase([prevContract]);
        }
        // computeRemainingHours: sum leaves → [{ s: "20" }] (used 20h, total=24, carry=4)
        return makeChainDatabase([{ s: "20" }]);
      }),
      update: vi.fn().mockReturnValue(updateChain),
      insert: vi.fn().mockReturnValue(insertChain),
    };
    const dbMock = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(txMock)),
    };

    const result = await renewContract({
      workspaceId: "ws-1",
      prevContractId: "contract-prev",
      input: {
        userId: "user-1",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
      },
      database: dbMock as never,
    });

    expect(result.id).toBe("contract-new");
    // prev contract should be set to expired
    const updateSetArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(updateSetArgs).toMatchObject({ status: "expired" });
    // new contract insert should have additionalLeaveHours = carry-over = max(0, 24-20=4)
    const insertValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertValues).toHaveProperty("additionalLeaveHours", "4");
  });

  it("throws when prev contract not found", async () => {
    const txMock = {
      select: vi.fn().mockReturnValue(makeChainDatabase([])),
    };
    const dbMock = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(txMock)),
    };

    await expect(
      renewContract({
        workspaceId: "ws-1",
        prevContractId: "nonexistent",
        input: {
          userId: "user-1",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-12-31"),
        },
        database: dbMock as never,
      })
    ).rejects.toThrow("prev contract not found");
  });

  it("throws when prev contract is not active", async () => {
    const expiredContract = { id: "contract-prev", status: "expired" };
    const txMock = {
      select: vi.fn().mockReturnValue(makeChainDatabase([expiredContract])),
    };
    const dbMock = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(txMock)),
    };

    await expect(
      renewContract({
        workspaceId: "ws-1",
        prevContractId: "contract-prev",
        input: {
          userId: "user-1",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-12-31"),
        },
        database: dbMock as never,
      })
    ).rejects.toThrow("prev contract must be active");
  });
});

// ---------------------------------------------------------------------------
// terminateContract
// ---------------------------------------------------------------------------

describe("terminateContract", () => {
  it("sets status=terminated", async () => {
    const terminatedRow = { id: "contract-1", status: "terminated" };
    const { db, updateChain } = makeUpdateDatabase([terminatedRow]);

    const result = await terminateContract({
      workspaceId: "ws-1",
      contractId: "contract-1",
      database: db as never,
    });

    expect(result?.status).toBe("terminated");
    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toMatchObject({ status: "terminated" });
  });

  it("returns null when contract not found or not active", async () => {
    const { db } = makeUpdateDatabase([]);

    const result = await terminateContract({
      workspaceId: "ws-1",
      contractId: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateContract
// ---------------------------------------------------------------------------

describe("updateContract", () => {
  it("updates specified fields and sets updatedAt", async () => {
    const updatedRow = {
      id: "contract-1",
      endDate: "2026-09-30",
      additionalLeaveHours: "8",
    };
    const { db, updateChain } = makeUpdateDatabase([updatedRow]);

    const result = await updateContract({
      workspaceId: "ws-1",
      contractId: "contract-1",
      patch: { endDate: "2026-09-30", additionalLeaveHours: 8 },
      database: db as never,
    });

    expect(result?.endDate).toBe("2026-09-30");
    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toHaveProperty("updatedAt");
    expect(setArgs.additionalLeaveHours).toBe("8");
  });
});

// ---------------------------------------------------------------------------
// updateLeaveRequest
// ---------------------------------------------------------------------------

describe("updateLeaveRequest", () => {
  it("recomputes hours when dates change", async () => {
    const existingLeave = {
      id: "leave-1",
      workspaceId: "ws-1",
      type: "day_off",
      startDate: "2026-02-02",
      endDate: "2026-02-02",
      timeFrom: null,
      timeTo: null,
      hours: "8",
    };
    const updatedLeave = {
      ...existingLeave,
      startDate: "2026-02-03",
      endDate: "2026-02-04",
      hours: "16",
    };

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updatedLeave]),
    };
    const db = {
      select: vi.fn().mockReturnValue(makeChainDatabase([existingLeave])),
      update: vi.fn().mockReturnValue(updateChain),
    };

    const result = await updateLeaveRequest({
      workspaceId: "ws-1",
      id: "leave-1",
      patch: { startDate: "2026-02-03", endDate: "2026-02-04" },
      holidays: new Set(),
      database: db as never,
    });

    expect(result?.hours).toBe("16");
    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toHaveProperty("hours");
  });

  it("returns null when leave not found", async () => {
    const db = { select: vi.fn().mockReturnValue(makeChainDatabase([])) };

    const result = await updateLeaveRequest({
      workspaceId: "ws-1",
      id: "nonexistent",
      patch: {},
      holidays: new Set(),
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteLeaveRequest
// ---------------------------------------------------------------------------

describe("deleteLeaveRequest", () => {
  it("hard deletes and returns id", async () => {
    const { db } = makeDeleteDatabase([{ id: "leave-1" }]);

    const result = await deleteLeaveRequest({
      workspaceId: "ws-1",
      id: "leave-1",
      database: db as never,
    });

    expect(result?.id).toBe("leave-1");
  });

  it("returns null when row not found", async () => {
    const { db } = makeDeleteDatabase([]);

    const result = await deleteLeaveRequest({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});
