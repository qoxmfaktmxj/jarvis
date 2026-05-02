import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db/client", () => {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
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
import { getMarketingByActivity, getMarketingByProduct } from "../actions";

describe("sales charts/marketing actions", () => {
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
    const a = await getMarketingByActivity({ ym: "202604" });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toBe("Unauthorized");
  });

  it("rejects without SALES_ALL permission", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const p = await getMarketingByProduct({ ym: "202604" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toBe("Forbidden");
  });

  it("rejects invalid ym (Zod)", async () => {
    await expect(getMarketingByActivity({ ym: "2026-04" })).rejects.toThrow();
  });

  it("returns ok shape on empty rows", async () => {
    const r = await getMarketingByActivity({ ym: "202604" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.isArray(r.rows)).toBe(true);
  });
});
