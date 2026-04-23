import { describe, expect, it } from "vitest";
import { orderDashboardNotices, filterDashboardNotices } from "./dashboard-notices.js";

type N = Parameters<typeof orderDashboardNotices>[0][number];

const now = new Date("2026-04-23T09:00:00Z");

function make(p: Partial<N>): N {
  return {
    id: p.id ?? "n",
    title: p.title ?? "t",
    bodyMd: p.bodyMd ?? "",
    sensitivity: p.sensitivity ?? "INTERNAL",
    pinned: p.pinned ?? false,
    publishedAt: "publishedAt" in p ? (p.publishedAt as Date | null) : new Date("2026-04-22T00:00:00Z"),
    expiresAt: p.expiresAt ?? null,
    authorId: p.authorId ?? "u",
    authorName: p.authorName ?? "테스터",
    createdAt: p.createdAt ?? new Date("2026-04-22T00:00:00Z")
  };
}

describe("filterDashboardNotices", () => {
  it("drops unpublished", () => {
    const rows = [make({ id: "a", publishedAt: null }), make({ id: "b" })];
    expect(filterDashboardNotices(rows, now).map((r) => r.id)).toEqual(["b"]);
  });
  it("drops expired", () => {
    const rows = [
      make({ id: "expired", expiresAt: new Date("2026-04-20T00:00:00Z") }),
      make({ id: "live", expiresAt: new Date("2026-04-24T00:00:00Z") })
    ];
    expect(filterDashboardNotices(rows, now).map((r) => r.id)).toEqual(["live"]);
  });
});

describe("orderDashboardNotices", () => {
  it("pinned first, then publishedAt desc", () => {
    const rows = [
      make({ id: "old-pinned", pinned: true, publishedAt: new Date("2026-04-01T00:00:00Z") }),
      make({ id: "new-plain", pinned: false, publishedAt: new Date("2026-04-23T00:00:00Z") }),
      make({ id: "new-pinned", pinned: true, publishedAt: new Date("2026-04-22T00:00:00Z") })
    ];
    const out = orderDashboardNotices(rows);
    expect(out.map((r) => r.id)).toEqual(["new-pinned", "old-pinned", "new-plain"]);
  });
});
