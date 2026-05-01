import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map(),
  cookies: async () => ({ get: () => undefined }),
}));

const getSession = vi.fn();
vi.mock("@jarvis/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));

const hasPermission = vi.fn();
vi.mock("@jarvis/auth", () => ({ hasPermission: (...a: unknown[]) => hasPermission(...a) }));

const listHolidays = vi.fn();
const createHoliday = vi.fn();
const updateHoliday = vi.fn();
const deleteHoliday = vi.fn();
vi.mock("@/lib/queries/holidays", () => ({
  listHolidays: (...a: unknown[]) => listHolidays(...a),
  createHoliday: (...a: unknown[]) => createHoliday(...a),
  updateHoliday: (...a: unknown[]) => updateHoliday(...a),
  deleteHoliday: (...a: unknown[]) => deleteHoliday(...a),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => {
      const tx = {
        insert: () => ({ values: async () => undefined }),
      };
      return fn(tx);
    },
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
  },
}));

import { listHolidaysAction, saveHolidaysAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ workspaceId: "ws-1", userId: "u-1", employeeId: null, permissions: ["contractor:admin"] });
  hasPermission.mockReturnValue(true);
});

describe("listHolidaysAction", () => {
  it("returns rows for the requested year", async () => {
    listHolidays.mockResolvedValue([
      { id: "h1", date: "2026-05-05", name: "어린이날", note: null, workspaceId: "ws-1" },
    ]);
    const res = await listHolidaysAction({ year: 2026 });
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows![0]).toMatchObject({ id: "h1", date: "2026-05-05", name: "어린이날", note: null });
  });

  it("rejects unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await listHolidaysAction({ year: 2026 });
    expect(res.ok).toBe(false);
  });
});

describe("saveHolidaysAction", () => {
  it("calls create/update/delete in batch", async () => {
    createHoliday.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
    updateHoliday.mockResolvedValue({ id: "22222222-2222-2222-2222-222222222222" });
    deleteHoliday.mockResolvedValue({ id: "33333333-3333-3333-3333-333333333333" });
    const res = await saveHolidaysAction({
      creates: [{ date: "2026-05-05", name: "어린이날", note: null }],
      updates: [{ id: "22222222-2222-2222-2222-222222222222", name: "수정" }],
      deletes: ["33333333-3333-3333-3333-333333333333"],
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.deleted).toBe(1);
  });
});
