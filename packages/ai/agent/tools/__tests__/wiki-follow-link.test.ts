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
    sensitivity: "sensitivity",
    workspaceId: "workspaceId",
    requiredPermission: "requiredPermission",
    publishedStatus: "publishedStatus",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _inArray: [col, vals] })),
}));

vi.mock("@jarvis/auth", () => ({
  canViewWikiPage: vi.fn(),
  PERMISSIONS: { ADMIN_ALL: "admin:all" },
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
import { canViewWikiPage } from "@jarvis/auth";
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

function makeSelectChainNoLimit(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
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

  it("source sensitivity forbidden → forbidden", async () => {
    makeSelectChainWithLimit([
      {
        path: "wiki/ws/secret.md",
        sensitivity: "SECRET_REF_ONLY",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await wikiFollowLink.execute({ from_slug: "secret-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "forbidden", error: expect.any(String) });
  });

  it("본문에 [[a]][[b]][[c]], a만 권한 없음 → links = [b, c]", async () => {
    // 1차 SELECT: source page
    const sourceChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          path: "wiki/ws/source.md",
          sensitivity: "INTERNAL",
          requiredPermission: null,
          publishedStatus: "published",
        },
      ]),
    };
    // 2차 SELECT: target pages batch
    const targetChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { slug: "a", title: "Page A", sensitivity: "SECRET_REF_ONLY", requiredPermission: null, publishedStatus: "published" },
        { slug: "b", title: "Page B", sensitivity: "INTERNAL", requiredPermission: null, publishedStatus: "published" },
        { slug: "c", title: "Page C", sensitivity: "PUBLIC", requiredPermission: null, publishedStatus: "published" },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(sourceChain)
      .mockReturnValueOnce(targetChain);

    // source: 접근 가능
    // a: 접근 불가, b,c: 접근 가능
    (canViewWikiPage as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // source
      .mockReturnValueOnce(false)  // a
      .mockReturnValueOnce(true)   // b
      .mockReturnValueOnce(true);  // c

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
        sensitivity: "PUBLIC",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
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
        sensitivity: "INTERNAL",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk error"));

    const result = await wikiFollowLink.execute({ from_slug: "err-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "unknown", error: "disk error" });
  });

  // new ACL tests
  it("source가 draft면 forbidden", async () => {
    makeSelectChainWithLimit([
      {
        path: "wiki/ws/draft.md",
        sensitivity: "INTERNAL",
        requiredPermission: null,
        publishedStatus: "draft",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await wikiFollowLink.execute({ from_slug: "draft-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "forbidden", error: expect.any(String) });
  });

  it("target 중 requiredPermission 있는 것은 silent drop", async () => {
    // source: published, 접근 가능
    const sourceChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          path: "wiki/ws/source.md",
          sensitivity: "INTERNAL",
          requiredPermission: null,
          publishedStatus: "published",
        },
      ]),
    };
    // targets: 하나는 requiredPermission='project.access:secret', 하나는 null
    const targetChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { slug: "open", title: "Open Page", sensitivity: "INTERNAL", requiredPermission: null, publishedStatus: "published" },
        { slug: "secret", title: "Secret Page", sensitivity: "INTERNAL", requiredPermission: "project.access:secret", publishedStatus: "published" },
      ]),
    };
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(sourceChain)
      .mockReturnValueOnce(targetChain);

    (canViewWikiPage as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // source OK
      .mockReturnValueOnce(true)   // open OK
      .mockReturnValueOnce(false); // secret blocked

    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("[[open]][[secret]]");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: null,
      body: "[[open]][[secret]]",
    });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([
      { target: "open", raw: "[[open]]" },
      { target: "secret", raw: "[[secret]]" },
    ]);

    const result = await wikiFollowLink.execute({ from_slug: "source-page" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const slugs = result.data.links.map((l) => l.slug);
      expect(slugs).toContain("open");
      expect(slugs).not.toContain("secret");
    }
  });
});
