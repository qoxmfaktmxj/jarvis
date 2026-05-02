import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db/client", () => {
  // Chainable that is also thenable — supports both `await db.select()...where()`
  // and `db.select()...where().groupBy().orderBy()`.
  const makeChain = (): unknown => {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.select = vi.fn(ret);
    chain.from = vi.fn(ret);
    chain.where = vi.fn(ret);
    chain.groupBy = vi.fn(ret);
    chain.orderBy = vi.fn(ret);
    chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
    return chain;
  };
  return { db: makeChain() };
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
import {
  getDashboardBA,
  getDashboardOpIncome,
  getDashboardSalesTrend,
  getDashboardSucProb,
} from "../actions";

describe("sales/dashboard actions", () => {
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

  it("getDashboardSalesTrend rejects empty years", async () => {
    await expect(getDashboardSalesTrend({ years: [] })).rejects.toThrow();
  });

  it("getDashboardSucProb forbids without permission", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const r = await getDashboardSucProb({ ym: "202604" });
    expect(r.ok).toBe(false);
  });

  it("getDashboardOpIncome returns 12-month arrays", async () => {
    const r = await getDashboardOpIncome({ year: 2026 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.months).toHaveLength(12);
  });

  it("getDashboardBA aggregates counts/amount", async () => {
    const r = await getDashboardBA({ ym: "202604" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.activityCount).toBe("number");
      expect(typeof r.opportunityCount).toBe("number");
      expect(typeof r.opportunityAmt).toBe("number");
    }
  });
});
