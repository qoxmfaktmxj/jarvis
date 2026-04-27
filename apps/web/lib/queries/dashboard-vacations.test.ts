import { describe, expect, it } from "vitest";
import {
  filterWeekVacations,
  computeWeekBounds
} from "./dashboard-vacations.js";

type V = Parameters<typeof filterWeekVacations>[0][number];

function make(p: Partial<V>): V {
  return {
    id: p.id ?? "l",
    userId: p.userId ?? "u",
    userName: p.userName ?? "홍길동",
    orgName: p.orgName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    type: p.type ?? "annual",
    startDate: p.startDate ?? "2026-04-22",
    endDate: p.endDate ?? "2026-04-24",
    hours: p.hours ?? 24,
    reason: p.reason ?? null,
    cancelledAt: p.cancelledAt ?? null,
    status: p.status ?? "approved"
  };
}

describe("computeWeekBounds", () => {
  it("Thursday 2026-04-23 → Mon 2026-04-20 to Sun 2026-04-26", () => {
    const b = computeWeekBounds(new Date("2026-04-23T09:00:00+09:00"));
    expect(b.weekStart).toBe("2026-04-20");
    expect(b.weekEnd).toBe("2026-04-26");
  });
  it("Sunday handled as end of week", () => {
    const b = computeWeekBounds(new Date("2026-04-26T12:00:00+09:00"));
    expect(b.weekStart).toBe("2026-04-20");
    expect(b.weekEnd).toBe("2026-04-26");
  });
});

describe("filterWeekVacations", () => {
  const bounds = { weekStart: "2026-04-20", weekEnd: "2026-04-26" };
  it("keeps overlapping leaves, drops outside + cancelled", () => {
    const rows = [
      make({ id: "in", startDate: "2026-04-22", endDate: "2026-04-24" }),
      make({ id: "cross-start", startDate: "2026-04-18", endDate: "2026-04-21" }),
      make({ id: "cross-end", startDate: "2026-04-26", endDate: "2026-04-28" }),
      make({ id: "before", startDate: "2026-04-10", endDate: "2026-04-12" }),
      make({ id: "after", startDate: "2026-04-30", endDate: "2026-05-02" }),
      make({
        id: "cancelled",
        cancelledAt: new Date("2026-04-22T00:00:00Z"),
        startDate: "2026-04-22",
        endDate: "2026-04-24"
      }),
      make({
        id: "rejected",
        status: "rejected",
        startDate: "2026-04-22",
        endDate: "2026-04-24"
      })
    ];
    const out = filterWeekVacations(rows, bounds);
    expect(out.map((r) => r.id).sort()).toEqual(
      ["cross-end", "cross-start", "in"].sort()
    );
  });
});
