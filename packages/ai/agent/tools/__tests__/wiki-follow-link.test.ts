import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  wikiPageIndex: {
    slug: "slug",
    title: "title",
    path: "path",
    workspaceId: "workspaceId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _inArray: [col, vals] })),
}));

vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(),
}));

vi.mock("@jarvis/wiki-fs/frontmatter", () => ({
  splitFrontmatter: vi.fn(),
}));

vi.mock("@jarvis/wiki-fs/wikilink", () => ({
  parseWikilinks: vi.fn(),
}));

// ── imports after mocks ────────────────────────────────────────────────────
import { db } from "@jarvis/db/client";
import { readPage } from "@jarvis/wiki-fs";
import { splitFrontmatter } from "@jarvis/wiki-fs/frontmatter";
import { parseWikilinks } from "@jarvis/wiki-fs/wikilink";
import { wikiFollowLink } from "../wiki-follow-link.js";
import type { ToolContext } from "../types.js";

// ── helpers ────────────────────────────────────────────────────────────────
const ctx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["knowledge:read"],
};

function makeSelectChainWithLimit(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ── tests ──────────────────────────────────────────────────────────────────
describe("wikiFollowLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("빈 from_slug → invalid", async () => {
    const result = await wikiFollowLink.execute({ from_slug: "" }, ctx);
    expect(result).toEqual({ ok: false, code: "invalid", error: expect.any(String) });
  });

  it("공백만 있는 from_slug → invalid", async () => {
    const result = await wikiFollowLink.execute({ from_slug: "   " }, ctx);
    expect(result).toEqual({ ok: false, code: "invalid", error: expect.any(String) });
  });

  it("from_slug not found → not_found", async () => {
    makeSelectChainWithLimit([]);
    const result = await wikiFollowLink.execute({ from_slug: "missing-page" }, ctx);
    expect(result).toEqual({
      ok: false,
      code: "not_found",
      error: expect.stringContaining("missing-page"),
    });
  });

  it("본문에 [[a]][[b]][[c]] → 모든 target 반환 (workspace 내)", async () => {
    // 1차 SELECT: source page
    const sourceChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          path: "wiki/ws/source.md",
        },
      ]),
    };
    // 2차 SELECT: target pages batch
    const targetChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { slug: "a", title: "Page A" },
        { slug: "b", title: "Page B" },
        { slug: "c", title: "Page C" },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(sourceChain)
      .mockReturnValueOnce(targetChain);

    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("[[a]][[b]][[c]]");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: null,
      body: "[[a]][[b]][[c]]",
    });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([
      { target: "a", raw: "[[a]]" },
      { target: "b", raw: "[[b]]" },
      { target: "c", raw: "[[c]]" },
    ]);

    const result = await wikiFollowLink.execute({ from_slug: "source-page" }, ctx);
    expect(result).toEqual({
      ok: true,
      data: {
        links: [
          { slug: "a", title: "Page A", direction: "outbound" },
          { slug: "b", title: "Page B", direction: "outbound" },
          { slug: "c", title: "Page C", direction: "outbound" },
        ],
      },
    });
  });

  it("본문에 wikilink 없으면 → { links: [] }", async () => {
    makeSelectChainWithLimit([
      {
        path: "wiki/ws/empty.md",
      },
    ]);
    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("no links here");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: null,
      body: "no links here",
    });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await wikiFollowLink.execute({ from_slug: "empty-page" }, ctx);
    expect(result).toEqual({ ok: true, data: { links: [] } });
  });

  it("readPage 예외 → unknown", async () => {
    makeSelectChainWithLimit([
      {
        path: "wiki/ws/err.md",
      },
    ]);
    (readPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk error"));

    const result = await wikiFollowLink.execute({ from_slug: "err-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "unknown", error: "disk error" });
  });
});
