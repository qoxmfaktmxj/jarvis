import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mocks (hoisted so they run before imports) ──────────────────────────
vi.mock("@jarvis/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        delete: () => ({ where: async () => ({ rowCount: 0 }) }),
        insert: () => ({ values: async () => undefined }),
      })
    ),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  serviceDeskIncident: {
    workspaceId: "workspaceId",
    enterCd: "enterCd",
    yyyy: "yyyy",
    mm: "mm",
    higherCd: "higherCd",
  },
  auditLog: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

// ── Subject under test ─────────────────────────────────────────────────────
vi.mock("./lib/sd-api-client.js", () => ({
  fetchIncidents: vi.fn(),
}));

import { fetchIncidents } from "./lib/sd-api-client.js";
import { serviceDeskImport } from "./service-desk-import.js";

describe("serviceDeskImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchIncidents).mockResolvedValue([
      {
        enter_cd: "100",
        higher_cd: "H008",
        higher_nm: "OPTI-HR",
        seq: "0",
        title: "<p>이슈</p>",
        complete_content: "<div>완료</div>",
        content: "내용",
        work_time: "30",
      },
    ]);
  });

  it("uses 80그룹 categories when ssnGrpCd === 80", async () => {
    await serviceDeskImport({
      workspaceId: "ws-1",
      enterCd: "100",
      ym: "202603",
      ssnGrpCd: "80",
    });
    expect(fetchIncidents).toHaveBeenCalledTimes(1);
    expect(fetchIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ higherCd: "H038" })
    );
  });

  it("uses 5 categories for non-80 group", async () => {
    await serviceDeskImport({
      workspaceId: "ws-1",
      enterCd: "100",
      ym: "202603",
      ssnGrpCd: "10",
    });
    expect(fetchIncidents).toHaveBeenCalledTimes(5);
    const cats = vi.mocked(fetchIncidents).mock.calls.map(([p]) => p.higherCd);
    expect(cats).toEqual(["H008", "H028", "H030", "H010", "H027"]);
  });
});
