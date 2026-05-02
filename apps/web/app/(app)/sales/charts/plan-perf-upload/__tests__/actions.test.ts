import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db/client", () => {
  const makeChain = (): unknown => {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.select = vi.fn(ret);
    chain.from = vi.fn(ret);
    chain.where = vi.fn(ret);
    chain.groupBy = vi.fn(ret);
    chain.orderBy = vi.fn(ret);
    chain.limit = vi.fn(ret);
    chain.offset = vi.fn(ret);
    chain.insert = vi.fn(ret);
    chain.values = vi.fn(ret);
    chain.onConflictDoNothing = vi.fn(ret);
    chain.onConflictDoUpdate = vi.fn(ret);
    chain.returning = vi.fn(() => Promise.resolve([] as unknown[]));
    chain.update = vi.fn(ret);
    chain.set = vi.fn(ret);
    chain.delete = vi.fn(ret);
    chain.transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(chain));
    chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
    return chain;
  };
  return { db: makeChain() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
import { listPlanPerfUpload, savePlanPerfUpload } from "../actions";

describe("sales/charts/plan-perf-upload actions", () => {
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

  it("listPlanPerfUpload rejects without session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const r = await listPlanPerfUpload({ page: 1, limit: 50 });
    expect(r.ok).toBe(false);
  });

  it("listPlanPerfUpload rejects without SALES_ALL", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const r = await listPlanPerfUpload({ page: 1, limit: 50 });
    expect(r.ok).toBe(false);
  });

  it("savePlanPerfUpload validates Zod (rejects invalid gubunCd)", async () => {
    await expect(
      savePlanPerfUpload({
        creates: [{ id: "x", ym: "202604", orgCd: "S1", orgNm: "n", gubunCd: "WRONG", trendGbCd: "SALES", amt: 100, note: null }],
        updates: [],
        deletes: [],
      }),
    ).rejects.toThrow();
  });

  it("savePlanPerfUpload accepts empty input", async () => {
    const r = await savePlanPerfUpload({ creates: [], updates: [], deletes: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.inserted).toBe(0);
      expect(r.updated).toBe(0);
      expect(r.deleted).toBe(0);
    }
  });
});
