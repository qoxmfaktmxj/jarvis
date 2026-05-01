import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures spies are available in vi.mock factory (hoisting boundary).
const { whereSpy, limitMock } = vi.hoisted(() => ({
  whereSpy: vi.fn().mockReturnThis(),
  limitMock: vi.fn(),
}));

// Mock db — shape matches user table columns selected in searchEmployees
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: whereSpy,
    limit: limitMock,
  },
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "u1",
    workspaceId: "w1",
    permissions: ["sales:all"],
    roles: [],
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => "test-session" }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { searchEmployees } from "../employees.js";

describe("searchEmployees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return one result; per-test can override with mockResolvedValueOnce.
    limitMock.mockResolvedValue([
      { employeeId: "S001", name: "홍길동", email: "hong@x.com" },
    ]);
  });

  it("rejects empty query (Zod min(2))", async () => {
    await expect(searchEmployees({ q: "", limit: 10 })).rejects.toThrow();
  });

  it("rejects q with length < 2", async () => {
    await expect(searchEmployees({ q: "a", limit: 10 })).rejects.toThrow();
  });

  it("rejects whitespace-only query (trims to empty)", async () => {
    // "   " trims to "" which fails min(2)
    await expect(searchEmployees({ q: "   ", limit: 10 })).rejects.toThrow();
  });

  it("returns hits for valid query", async () => {
    const hits = await searchEmployees({ q: "ho", limit: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ sabun: expect.any(String), name: expect.any(String) });
  });

  it("throws Unauthorized when no session", async () => {
    const sess = await import("@jarvis/auth/session");
    // getSession already returns JarvisSession | null — no cast needed.
    vi.mocked(sess.getSession).mockResolvedValueOnce(null);
    await expect(searchEmployees({ q: "ho", limit: 10 })).rejects.toThrow(/Unauthorized/);
  });

  it("throws Forbidden when session lacks SALES_ALL permission", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-no-perm",
      workspaceId: "w1",
      permissions: [],
      roles: [],
    } as never);
    await expect(searchEmployees({ q: "ho", limit: 10 })).rejects.toThrow(/Forbidden/);
  });

  it("passes session.workspaceId to the query (WHERE called once)", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-ws-check",
      workspaceId: "ws-test-x",
      id: "s1",
      expiresAt: Date.now() + 3600_000,
      employeeId: "E001",
      permissions: ["sales:all"],
      roles: [],
    } as never);
    limitMock.mockResolvedValueOnce([]);

    await searchEmployees({ q: "al", limit: 5 });

    // WHERE must have been called exactly once with the composed and(...) expression.
    expect(whereSpy).toHaveBeenCalledTimes(1);
    // The single call receives exactly one argument (the composed and() SQL node).
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
  });

  it("applies active + ILIKE filters (WHERE receives composed and(...) arg)", async () => {
    limitMock.mockResolvedValueOnce([
      { employeeId: "S002", name: "김철수", email: "kim@x.com" },
    ]);

    const hits = await searchEmployees({ q: "김철", limit: 3 });

    // WHERE must be called once — proves the query isn't bypassing predicates.
    expect(whereSpy).toHaveBeenCalledTimes(1);
    // The call receives a single composed SQL argument (workspace + status + ilike).
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
    // Result is correctly mapped from the mocked rows.
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sabun: "S002", name: "김철수" });
  });
});
