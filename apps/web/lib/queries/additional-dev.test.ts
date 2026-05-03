import { describe, expect, it, vi } from "vitest";
import {
  createAdditionalDev,
  deleteAdditionalDev,
  getAdditionalDev,
  listAdditionalDev,
  updateAdditionalDev,
  upsertEffort,
} from "./additional-dev";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock database chain that supports all Drizzle ORM method chains
 * including leftJoin and offset (required by listAdditionalDev / getAdditionalDev).
 */
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
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  (chain as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    Promise.resolve(resolve(resolveWith));
  return chain;
}

function makeTwoSelectDatabase(firstRows: unknown[], secondRows: unknown[]) {
  const db = { select: vi.fn() };
  db.select
    .mockReturnValueOnce(makeChainDatabase(firstRows))
    .mockReturnValueOnce(makeChainDatabase(secondRows));
  return db;
}

function makeInsertDatabase(returnRows: unknown[]) {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnRows),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: { insert: vi.fn().mockReturnValue(insertChain) },
    insertChain,
  };
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

/**
 * Builds a single-select mock database that supports leftJoin and offset chains.
 * Required by getAdditionalDev which does: select().from().leftJoin().leftJoin().leftJoin().where().limit(1)
 */
function makeSelectDatabase(resolveWith: unknown[]) {
  return { select: vi.fn().mockReturnValue(makeChainDatabase(resolveWith)) };
}

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

/**
 * Wraps flat additionalDevelopment fields in the joined row shape that Drizzle
 * returns after `.select({ row: additionalDevelopment, pmName: ..., ... })`.
 */
function wrapJoinRow(flat: Record<string, unknown>) {
  return {
    row: flat,
    pmName: null as string | null,
    pmSabun: null as string | null,
    devName: null as string | null,
    devSabun: null as string | null,
    customerCompanyName: null as string | null,
    customerCompanyCode: null as string | null,
  };
}

// ---------------------------------------------------------------------------
// listAdditionalDev
// ---------------------------------------------------------------------------

describe("listAdditionalDev", () => {
  it("returns paginated data with proper pagination metadata", async () => {
    const flatRow = {
      id: "add-dev-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Test Project",
      status: "협의중",
      part: "Saas",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    // listAdditionalDev does select({ row, pmName, ... }) → rows are {row, pmName, ...} shaped
    const db = makeTwoSelectDatabase([wrapJoinRow(flatRow)], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      database: db as never,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("add-dev-1");
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(20);
    expect(result.pagination.totalPages).toBe(1);
  });

  it("filters by status", async () => {
    const flatRow = {
      id: "add-dev-2",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Status Filter Project",
      status: "진행중",
      createdAt: new Date("2026-01-02"),
      updatedAt: new Date("2026-01-02"),
    };

    const db = makeTwoSelectDatabase([wrapJoinRow(flatRow)], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      status: "진행중",
      database: db as never,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe("진행중");
  });

  it("filters by part", async () => {
    const flatRow = {
      id: "add-dev-3",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Part Filter Project",
      status: "협의중",
      part: "모바일",
      createdAt: new Date("2026-01-03"),
      updatedAt: new Date("2026-01-03"),
    };

    const db = makeTwoSelectDatabase([wrapJoinRow(flatRow)], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      part: "모바일",
      database: db as never,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.part).toBe("모바일");
  });
});

// ---------------------------------------------------------------------------
// createAdditionalDev
// ---------------------------------------------------------------------------

describe("createAdditionalDev", () => {
  function makeCreateDatabase(createdRows: unknown[]) {
    // createAdditionalDev calls select (FK guard) then insert.
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "proj-1" }]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(createdRows),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
    };
    return { db, insertChain };
  }

  it("persists projectId and defaults status to '협의중'", async () => {
    const createdRow = {
      id: "new-add-dev-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "New Project",
      status: "협의중",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const { db, insertChain } = makeCreateDatabase([createdRow]);

    const result = await createAdditionalDev({
      workspaceId: "ws-1",
      input: { projectId: "proj-1", projectName: "New Project" },
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result.projectId).toBe("proj-1");
    // Verify values passed to insert contain status defaulted to '협의중'
    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({ status: "협의중" });
  });

  it("uses provided status when given", async () => {
    const createdRow = {
      id: "new-add-dev-2",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Another Project",
      status: "진행중",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const { db, insertChain } = makeCreateDatabase([createdRow]);

    await createAdditionalDev({
      workspaceId: "ws-1",
      input: { projectId: "proj-1", projectName: "Another Project", status: "진행중" },
      database: db as never,
    });

    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({ status: "진행중" });
  });

  it("rejects customerCompanyId from another workspace", async () => {
    // The FK guard select for project returns a row (project exists in workspace),
    // but the FK guard select for company returns nothing (company is in another workspace).
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      // First call: project FK check → found. Second call: company FK check → not found.
      limit: vi.fn()
        .mockResolvedValueOnce([{ id: "proj-1" }])
        .mockResolvedValueOnce([]),
    };
    const db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn(),
    };

    await expect(
      createAdditionalDev({
        workspaceId: "ws-1",
        input: {
          projectId: "proj-1",
          customerCompanyId: "company-from-ws-2",
        },
        database: db as never,
      }),
    ).rejects.toThrow("customerCompanyId not in workspace");

    // Insert must never be called when FK validation fails.
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAdditionalDev
// ---------------------------------------------------------------------------

describe("getAdditionalDev", () => {
  it("returns row by id scoped to workspace", async () => {
    const flatRow = {
      id: "add-dev-10",
      workspaceId: "ws-1",
      projectId: "proj-1",
      status: "협의중",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    // getAdditionalDev uses leftJoin — makeSelectDatabase now supports the full chain
    const db = makeSelectDatabase([wrapJoinRow(flatRow)]);

    const result = await getAdditionalDev({
      workspaceId: "ws-1",
      id: "add-dev-10",
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("add-dev-10");
  });

  it("returns null when row not found", async () => {
    const db = makeSelectDatabase([]);

    const result = await getAdditionalDev({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateAdditionalDev
// ---------------------------------------------------------------------------

describe("updateAdditionalDev", () => {
  it("modifies fields and updates updatedAt", async () => {
    const updatedRow = {
      id: "add-dev-20",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Updated Project",
      status: "완료",
      updatedAt: new Date("2026-02-01"),
      createdAt: new Date("2026-01-01"),
    };

    const { db, updateChain } = makeUpdateDatabase([updatedRow]);

    const result = await updateAdditionalDev({
      workspaceId: "ws-1",
      id: "add-dev-20",
      input: { projectName: "Updated Project", status: "완료" },
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("완료");
    // Verify set was called with updatedAt
    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toHaveProperty("updatedAt");
    expect(setArgs.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// deleteAdditionalDev
// ---------------------------------------------------------------------------

describe("deleteAdditionalDev", () => {
  it("removes row and returns id", async () => {
    const { db } = makeDeleteDatabase([{ id: "add-dev-30" }]);

    const result = await deleteAdditionalDev({
      workspaceId: "ws-1",
      id: "add-dev-30",
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("add-dev-30");
  });

  it("returns null when row not found", async () => {
    const { db } = makeDeleteDatabase([]);

    const result = await deleteAdditionalDev({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertEffort
// ---------------------------------------------------------------------------

describe("upsertEffort", () => {
  it("calls insert with onConflictDoUpdate for upsert behavior", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    // assertAddDevInWorkspace uses select/from/where/limit chain — mock it to return a row.
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "add-dev-1" }]),
    };
    const db = {
      insert: vi.fn().mockReturnValue(insertChain),
      select: vi.fn().mockReturnValue(selectChain),
    };

    await upsertEffort({
      addDevId: "add-dev-1",
      workspaceId: "ws-1",
      yearMonth: "2026-01",
      effort: "10.5",
      database: db as never,
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledWith({
      addDevId: "add-dev-1",
      yearMonth: "2026-01",
      effort: "10.5",
    });
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Additional tests for AddDev schema supplement plan
// ---------------------------------------------------------------------------

describe("listAdditionalDev — join field population", () => {
  it("populates customerCompanyName in list result", async () => {
    const flatRow = {
      id: "add-dev-100",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Customer Co Project",
      status: "협의중",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const joinedRow = {
      row: flatRow,
      pmName: null,
      pmSabun: null,
      devName: null,
      devSabun: null,
      customerCompanyName: "삼성전자",
      customerCompanyCode: "SAMSUNG",
    };

    const db = makeTwoSelectDatabase([joinedRow], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      database: db as never,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.customerCompanyName).toBe("삼성전자");
    expect(result.data[0]?.customerCompanyCode).toBe("SAMSUNG");
  });

  it("populates pmName and devName in list result when resolved", async () => {
    const flatRow = {
      id: "add-dev-101",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Staff Named Project",
      status: "진행중",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const joinedRow = {
      row: flatRow,
      pmName: "홍길동",
      pmSabun: "EMP001",
      devName: "이순신",
      devSabun: "EMP002",
      customerCompanyName: null,
      customerCompanyCode: null,
    };

    const db = makeTwoSelectDatabase([joinedRow], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      database: db as never,
    });

    expect(result.data[0]?.pmName).toBe("홍길동");
    expect(result.data[0]?.pmSabun).toBe("EMP001");
    expect(result.data[0]?.devName).toBe("이순신");
    expect(result.data[0]?.devSabun).toBe("EMP002");
  });
});

describe("schema rename guard — paidEffort not estimatedEffort", () => {
  it("list result row has paidEffort field (schema rename guard)", async () => {
    // The schema renamed estimatedEffort → paidEffort.
    // This test ensures the row shape does NOT accidentally re-introduce 'estimatedEffort'
    // as a runtime key by verifying that paidEffort passes through and no estimatedEffort key exists.
    const flatRow = {
      id: "add-dev-200",
      workspaceId: "ws-1",
      projectId: "proj-1",
      projectName: "Rename Guard Project",
      status: "협의중",
      paidEffort: "5.5",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const db = makeTwoSelectDatabase([wrapJoinRow(flatRow)], [{ total: 1 }]);

    const result = await listAdditionalDev({
      workspaceId: "ws-1",
      database: db as never,
    });

    const row = result.data[0];
    expect(row).toBeDefined();
    // paidEffort must survive the flatten
    expect(row?.paidEffort).toBe("5.5");
    // estimatedEffort must not appear — the old key was removed in migration
    expect(row).not.toHaveProperty("estimatedEffort");
  });
});
