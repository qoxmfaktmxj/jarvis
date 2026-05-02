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
import { getTrend } from "../actions";

describe("sales charts/trend getTrend", () => {
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
    const r = await getTrend({ years: [2025, 2026], metric: "SALES" });
    expect(r.ok).toBe(false);
  });

  it("returns one series per year, 12-bucket arrays", async () => {
    const r = await getTrend({ years: [2024, 2025, 2026], metric: "OP_INCOME" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.series).toHaveLength(3);
      expect(r.months).toHaveLength(12);
      expect(r.series[0]?.values).toHaveLength(12);
    }
  });

  it("rejects empty years (Zod min(1))", async () => {
    await expect(getTrend({ years: [], metric: "SALES" })).rejects.toThrow();
  });

  it("rejects >5 years (Zod max(5))", async () => {
    await expect(getTrend({ years: [2020, 2021, 2022, 2023, 2024, 2025], metric: "SALES" })).rejects.toThrow();
  });
});
