import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db — shape matches user table columns selected in searchEmployees
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { employeeId: "S001", name: "홍길동", email: "hong@x.com" },
    ]),
  },
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ userId: "u1", workspaceId: "w1" }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => "test-session" }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { searchEmployees } from "../employees.js";

describe("searchEmployees", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects empty query (Zod min(2))", async () => {
    await expect(searchEmployees({ q: "", limit: 10 })).rejects.toThrow();
  });

  it("rejects q with length < 2", async () => {
    await expect(searchEmployees({ q: "a", limit: 10 })).rejects.toThrow();
  });

  it("returns hits for valid query", async () => {
    const hits = await searchEmployees({ q: "ho", limit: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ sabun: expect.any(String), name: expect.any(String) });
  });

  it("throws Unauthorized when no session", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce(null as never);
    await expect(searchEmployees({ q: "ho", limit: 10 })).rejects.toThrow(/Unauthorized/);
  });
});
