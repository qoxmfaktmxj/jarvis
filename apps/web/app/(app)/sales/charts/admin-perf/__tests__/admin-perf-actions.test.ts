import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db/client", () => {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  return { db: queryBuilder };
});

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "u1",
    workspaceId: "ws1",
    permissions: ["sales:all"],
    roles: [],
  }),
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: (k: string) => (k === "x-session-id" ? "test-session" : null) }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { getAdminPerf } from "../actions";

describe("sales charts/admin-perf getAdminPerf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      workspaceId: "ws1",
      permissions: ["sales:all"],
      roles: [],
    } as never);
  });

  it("rejects without session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const r = await getAdminPerf({ year: 2026, view: "year", metric: "SALES" });
    expect(r.ok).toBe(false);
  });

  it("buckets=12 in year view", async () => {
    const r = await getAdminPerf({ year: 2026, view: "year", metric: "SALES" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.buckets).toHaveLength(12);
  });

  it("buckets=4 in quarter view", async () => {
    const r = await getAdminPerf({ year: 2026, view: "quarter", metric: "SALES" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.buckets).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });

  it("rejects invalid year (Zod)", async () => {
    await expect(getAdminPerf({ year: 1900, view: "year", metric: "SALES" })).rejects.toThrow();
  });
});
