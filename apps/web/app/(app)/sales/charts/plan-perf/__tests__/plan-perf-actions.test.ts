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
import { getPlanPerfChart } from "../actions";

describe("sales charts/plan-perf getPlanPerfChart", () => {
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

  it("rejects without permission", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const r = await getPlanPerfChart({ year: 2026, metric: "SALES" });
    expect(r.ok).toBe(false);
  });

  it("returns 12-month arrays", async () => {
    const r = await getPlanPerfChart({ year: 2026, metric: "SALES" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.months).toHaveLength(12);
      expect(r.plan).toHaveLength(12);
      expect(r.actual).toHaveLength(12);
      expect(r.forecast).toHaveLength(12);
    }
  });
});
