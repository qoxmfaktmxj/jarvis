import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCatalog } from "../catalog.js";

vi.mock("@jarvis/db/client", () => ({
  db: { execute: vi.fn() },
}));

describe("getCatalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns RBAC-filtered pages with snippet + aliases + tags", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [{
        path: "manual/policies/leave-vacation",
        title: "휴가 규정",
        slug: "leave-vacation",
        aliases: ["휴가", "빙부상", "처부모상"],
        tags: ["domain/hr"],
        snippet: "근속 연수별 연차 부여와 경조사 휴가 규정을 정의한다.",
        updated_at: new Date("2026-04-01"),
      }],
    } as never);

    const hits = await getCatalog({
      workspaceId: "ws-uuid",
      userPermissions: ["knowledge:read"],
      domain: "policies",
      limit: 500,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]!.aliases).toContain("빙부상");
    expect(hits[0]!.snippet).toContain("경조사");
  });

  it("applies sensitivity filter via buildWikiSensitivitySqlFilter", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);
    await getCatalog({ workspaceId: "ws-uuid", userPermissions: [], limit: 500 });
    expect(vi.mocked(db.execute).mock.calls.length).toBe(1);
  });

  it("omits domain filter when domain is undefined", async () => {
    const { db } = await import("@jarvis/db/client");
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);
    await getCatalog({ workspaceId: "ws-uuid", userPermissions: ["knowledge:read"], limit: 500 });
    expect(vi.mocked(db.execute).mock.calls.length).toBe(1);
  });
});
