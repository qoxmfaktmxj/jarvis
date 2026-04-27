import { describe, expect, it } from "vitest";
import { orderLatestWikiPages } from "./dashboard-wiki.js";

type W = Parameters<typeof orderLatestWikiPages>[0][number];

function make(p: Partial<W>): W {
  return {
    id: p.id ?? "w",
    title: p.title ?? "t",
    path: p.path ?? "/p",
    slug: p.slug ?? "p",
    tags: p.tags ?? [],
    authorId: p.authorId ?? "u",
    authorName: p.authorName ?? "작성자",
    createdAt: p.createdAt ?? new Date("2026-04-20T00:00:00Z"),
    updatedAt: p.updatedAt ?? new Date("2026-04-20T00:00:00Z"),
    sensitivity: p.sensitivity ?? "INTERNAL"
  };
}

describe("orderLatestWikiPages", () => {
  it("orders by createdAt desc, limit 10", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      make({
        id: `w${i}`,
        createdAt: new Date(2026, 3, i + 1),
        title: `p${i}`
      })
    );
    const out = orderLatestWikiPages(rows, 10);
    expect(out).toHaveLength(10);
    expect(out[0]!.id).toBe("w14");
    expect(out[9]!.id).toBe("w5");
  });
});
