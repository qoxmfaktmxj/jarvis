import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, getSession, deleteSession, renewSession } from "./session.js";
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
    keepSignedIn: false,
    ...overrides,
  };
}

// Fix E: DRY helper for simple select mocks (no chain refs needed)
function mockSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
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

  it("createSession persists session.expiresAt to DB expires_at column", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values });

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const customExpiry = Date.now() + thirtyDaysMs;
    const s = makeSession({ expiresAt: customExpiry });

    await createSession(s);

    const arg = values.mock.calls[0]![0];
    expect(arg.expiresAt).toBeInstanceOf(Date);
    expect((arg.expiresAt as Date).getTime()).toBe(customExpiry);
  });

  it("getSession returns null for empty id", async () => {
    const result = await getSession("");
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  // Fix A: valid id, no row in DB
  it("getSession returns null when no row matches", async () => {
    mockSelect([]);

    expect(await getSession("missing")).toBeNull();
  });

  it("getSession returns session blob when row exists and not expired", async () => {
    const s = makeSession();
    mockSelect([{ id: s.id, data: s, expiresAt: new Date(Date.now() + 10_000) }]);

    const result = await getSession("sess-1");
    expect(result).toEqual(s);
  });

  it("getSession deletes and returns null when expired", async () => {
    const s = makeSession();
    // Keep explicit chain here so we can reference whereDel for assertion
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

  // Fix B: assert where() was called (not just delete)
  it("deleteSession issues DELETE by id", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    dbMock.delete.mockReturnValue({ where });

    await deleteSession("sess-1");
    expect(dbMock.delete).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

});

describe("renewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when session row not found", async () => {
    mockSelect([]);
    const result = await renewSession("missing");
    expect(result).toBeNull();
  });

  it("returns null when keepSignedIn is false", async () => {
    const s = makeSession({ keepSignedIn: false });
    mockSelect([{ id: s.id, data: s, expiresAt: new Date(Date.now() + 5_000) }]);

    const result = await renewSession("sess-1");
    expect(result).toBeNull();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns null when keepSignedIn is absent (treated as false)", async () => {
    const { keepSignedIn: _, ...sWithout } = makeSession();
    mockSelect([{ id: "sess-1", data: sWithout, expiresAt: new Date(Date.now() + 5_000) }]);

    const result = await renewSession("sess-1");
    expect(result).toBeNull();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("updates expiresAt by 30 days and returns newExpiresAt when keepSignedIn is true", async () => {
    const s = makeSession({ keepSignedIn: true });
    mockSelect([{ id: s.id, data: s, expiresAt: new Date(Date.now() + 10_000) }]);

    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    dbMock.update.mockReturnValue({ set });

    const before = Date.now();
    const result = await renewSession("sess-1");
    const after = Date.now();

    expect(result).not.toBeNull();
    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
    expect(result!.newExpiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(result!.newExpiresAt).toBeLessThanOrEqual(expectedMax);
    expect(dbMock.update).toHaveBeenCalledOnce();
  });
});
