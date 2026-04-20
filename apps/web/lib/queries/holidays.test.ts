import { describe, expect, it, vi } from "vitest";
import {
  createHoliday,
  deleteHoliday,
  getHoliday,
  getHolidaySetForRange,
  listHolidays,
  updateHoliday,
} from "./holidays";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChainDatabase(resolveWith: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
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

function makeSelectDatabase(resolveWith: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveWith),
  };
  return { select: vi.fn().mockReturnValue(chain) };
}

function makeSelectOrderByDatabase(resolveWith: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(resolveWith),
  };
  return { select: vi.fn().mockReturnValue(chain) };
}

function makeInsertDatabase(returnRows: unknown[]) {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnRows),
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

// ---------------------------------------------------------------------------
// listHolidays
// ---------------------------------------------------------------------------

describe("listHolidays", () => {
  it("returns all holidays for workspace", async () => {
    const rows = [
      {
        id: "h-1",
        workspaceId: "ws-1",
        date: "2026-01-01",
        name: "신정",
        note: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];

    const db = makeSelectOrderByDatabase(rows);

    const result = await listHolidays({ workspaceId: "ws-1", database: db as never });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("h-1");
  });

  it("filters by year (only dates within Jan 1 – Dec 31 of that year)", async () => {
    const rows = [
      {
        id: "h-2026",
        workspaceId: "ws-1",
        date: "2026-05-05",
        name: "어린이날",
        note: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];

    const db = makeSelectOrderByDatabase(rows);

    const result = await listHolidays({ workspaceId: "ws-1", year: 2026, database: db as never });

    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe("2026-05-05");
  });
});

// ---------------------------------------------------------------------------
// createHoliday + listHolidays basic
// ---------------------------------------------------------------------------

describe("createHoliday", () => {
  it("inserts and returns the created row", async () => {
    const createdRow = {
      id: "h-new",
      workspaceId: "ws-1",
      date: "2026-02-16",
      name: "설날",
      note: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const { db, insertChain } = makeInsertDatabase([createdRow]);

    const result = await createHoliday({
      workspaceId: "ws-1",
      input: { date: "2026-02-16", name: "설날" },
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result.date).toBe("2026-02-16");
    expect(result.name).toBe("설날");

    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({
      workspaceId: "ws-1",
      date: "2026-02-16",
      name: "설날",
    });
  });

  it("includes note when provided", async () => {
    const createdRow = {
      id: "h-noted",
      workspaceId: "ws-1",
      date: "2026-03-01",
      name: "삼일절",
      note: "3.1 운동 기념",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const { db, insertChain } = makeInsertDatabase([createdRow]);

    await createHoliday({
      workspaceId: "ws-1",
      input: { date: "2026-03-01", name: "삼일절", note: "3.1 운동 기념" },
      database: db as never,
    });

    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertedValues.note).toBe("3.1 운동 기념");
  });

  it("throws when DB returns no row (e.g. constraint violation simulation)", async () => {
    const { db } = makeInsertDatabase([]);

    await expect(
      createHoliday({
        workspaceId: "ws-1",
        input: { date: "2026-01-01", name: "신정" },
        database: db as never,
      })
    ).rejects.toThrow("failed to create holiday");
  });
});

// ---------------------------------------------------------------------------
// getHoliday
// ---------------------------------------------------------------------------

describe("getHoliday", () => {
  it("returns row by id scoped to workspace", async () => {
    const row = {
      id: "h-10",
      workspaceId: "ws-1",
      date: "2026-08-15",
      name: "광복절",
      note: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const db = makeSelectDatabase([row]);

    const result = await getHoliday({ workspaceId: "ws-1", id: "h-10", database: db as never });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("h-10");
  });

  it("returns null when row not found", async () => {
    const db = makeSelectDatabase([]);

    const result = await getHoliday({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateHoliday
// ---------------------------------------------------------------------------

describe("updateHoliday", () => {
  it("patches note and name and sets updatedAt", async () => {
    const updatedRow = {
      id: "h-20",
      workspaceId: "ws-1",
      date: "2026-10-03",
      name: "개천절 (수정)",
      note: "업데이트된 노트",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-02-01"),
    };

    const { db, updateChain } = makeUpdateDatabase([updatedRow]);

    const result = await updateHoliday({
      workspaceId: "ws-1",
      id: "h-20",
      patch: { name: "개천절 (수정)", note: "업데이트된 노트" },
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result?.name).toBe("개천절 (수정)");
    expect(result?.note).toBe("업데이트된 노트");

    const setArgs = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setArgs).toHaveProperty("updatedAt");
    expect(setArgs.updatedAt).toBeInstanceOf(Date);
  });

  it("returns null when row not found", async () => {
    const { db } = makeUpdateDatabase([]);

    const result = await updateHoliday({
      workspaceId: "ws-1",
      id: "nonexistent",
      patch: { name: "변경" },
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteHoliday
// ---------------------------------------------------------------------------

describe("deleteHoliday", () => {
  it("removes row and returns id", async () => {
    const { db } = makeDeleteDatabase([{ id: "h-30" }]);

    const result = await deleteHoliday({
      workspaceId: "ws-1",
      id: "h-30",
      database: db as never,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("h-30");
  });

  it("returns null when row not found", async () => {
    const { db } = makeDeleteDatabase([]);

    const result = await deleteHoliday({
      workspaceId: "ws-1",
      id: "nonexistent",
      database: db as never,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getHolidaySetForRange
// ---------------------------------------------------------------------------

describe("getHolidaySetForRange", () => {
  it("returns Set<string> of YYYY-MM-DD within range", async () => {
    const rows = [
      { date: "2026-01-01" },
      { date: "2026-02-16" },
      { date: "2026-03-01" },
    ];

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    const db = { select: vi.fn().mockReturnValue(chain) };

    const result = await getHolidaySetForRange({
      workspaceId: "ws-1",
      from: "2026-01-01",
      to: "2026-03-31",
      database: db as never,
    });

    expect(result).toBeInstanceOf(Set);
    expect(result.has("2026-01-01")).toBe(true);
    expect(result.has("2026-02-16")).toBe(true);
    expect(result.has("2026-03-01")).toBe(true);
    expect(result.has("2026-05-05")).toBe(false);
    expect(result.size).toBe(3);
  });

  it("returns empty Set when no holidays in range", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const db = { select: vi.fn().mockReturnValue(chain) };

    const result = await getHolidaySetForRange({
      workspaceId: "ws-1",
      from: "2026-06-01",
      to: "2026-06-30",
      database: db as never,
    });

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
