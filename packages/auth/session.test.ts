import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, getSession, deleteSession, refreshSession } from "./session.js";
import type { JarvisSession } from "./types.js";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@jarvis/db/client", () => ({ db: dbMock }));

function makeSession(overrides: Partial<JarvisSession> = {}): JarvisSession {
  return {
    id: "sess-1",
    userId: "user-1",
    workspaceId: "ws-1",
    employeeId: "emp-1",
    name: "Tester",
    roles: ["user"],
    permissions: ["knowledge:read"],
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("session (PG-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSession inserts a row with id, data, expires_at", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values });

    const s = makeSession();
    await createSession(s);

    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
    const arg = values.mock.calls[0]![0];
    expect(arg.id).toBe("sess-1");
    expect(arg.data).toEqual(s);
    expect(arg.expiresAt).toBeInstanceOf(Date);
  });

  it("getSession returns null for empty id", async () => {
    const result = await getSession("");
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("getSession returns session blob when row exists and not expired", async () => {
    const s = makeSession();
    const limit = vi.fn().mockResolvedValue([{ id: s.id, data: s, expiresAt: new Date(Date.now() + 10_000) }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getSession("sess-1");
    expect(result).toEqual(s);
  });

  it("getSession deletes and returns null when expired", async () => {
    const s = makeSession();
    const limit = vi.fn().mockResolvedValue([{ id: s.id, data: s, expiresAt: new Date(Date.now() - 1000) }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const whereDel = vi.fn().mockResolvedValue(undefined);
    dbMock.delete.mockReturnValue({ where: whereDel });

    const result = await getSession("sess-1");
    expect(result).toBeNull();
    expect(dbMock.delete).toHaveBeenCalledOnce();
  });

  it("deleteSession issues DELETE by id", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    dbMock.delete.mockReturnValue({ where });

    await deleteSession("sess-1");
    expect(dbMock.delete).toHaveBeenCalledOnce();
  });

  it("refreshSession extends expires_at and data.expiresAt", async () => {
    const s = makeSession();
    const limit = vi.fn().mockResolvedValue([{ id: s.id, data: s, expiresAt: new Date() }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const whereUpd = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: whereUpd });
    dbMock.update.mockReturnValue({ set });

    await refreshSession("sess-1");
    expect(set).toHaveBeenCalledOnce();
    const setArg = set.mock.calls[0]![0];
    expect(setArg.expiresAt).toBeInstanceOf(Date);
    expect(setArg.data.expiresAt).toBeGreaterThan(Date.now());
  });
});
