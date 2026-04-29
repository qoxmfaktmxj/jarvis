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
import { wikiRead } from "../wiki-read.js";
import type { ToolContext } from "../types.js";

// ── helpers ────────────────────────────────────────────────────────────────
const ctx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["knowledge:read"],
};

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ── tests ──────────────────────────────────────────────────────────────────
describe("wikiRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("빈 slug → invalid", async () => {
    const result = await wikiRead.execute({ slug: "" }, ctx);
    expect(result).toEqual({ ok: false, code: "invalid", error: expect.any(String) });
  });

  it("공백만 있는 slug → invalid", async () => {
    const result = await wikiRead.execute({ slug: "   " }, ctx);
    expect(result).toEqual({ ok: false, code: "invalid", error: expect.any(String) });
  });

  it("slug not found → not_found", async () => {
    makeSelectChain([]);
    const result = await wikiRead.execute({ slug: "missing-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "not_found", error: expect.stringContaining("missing-page") });
  });

  it("sensitivity forbidden → forbidden", async () => {
    makeSelectChain([
      {
        slug: "secret-page",
        title: "Secret",
        path: "wiki/ws/secret.md",
        sensitivity: "SECRET_REF_ONLY",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await wikiRead.execute({ slug: "secret-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "forbidden", error: expect.any(String) });
  });

  it("정상 → frontmatter + content + outbound_wikilinks 반환", async () => {
    makeSelectChain([
      {
        slug: "my-page",
        title: "My Page",
        path: "wiki/ws/my-page.md",
        sensitivity: "INTERNAL",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("---\ntitle: My Page\n---\nHello [[other]]");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: "title: My Page",
      body: "Hello [[other]]",
    });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([{ target: "other", raw: "[[other]]" }]);

    const result = await wikiRead.execute({ slug: "my-page" }, ctx);
    expect(result).toEqual({
      ok: true,
      data: {
        slug: "my-page",
        title: "My Page",
        path: "wiki/ws/my-page.md",
        sensitivity: "INTERNAL",
        frontmatter: "title: My Page",
        content: "Hello [[other]]",
        outbound_wikilinks: ["other"],
      },
    });
  });

  it("outbound_wikilinks 중복 제거: [[a]][[b]][[a]] → ['a','b']", async () => {
    makeSelectChain([
      {
        slug: "dup-page",
        title: "Dup",
        path: "wiki/ws/dup.md",
        sensitivity: "PUBLIC",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("[[a]][[b]][[a]]");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({
      frontmatter: null,
      body: "[[a]][[b]][[a]]",
    });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([
      { target: "a", raw: "[[a]]" },
      { target: "b", raw: "[[b]]" },
      { target: "a", raw: "[[a]]" },
    ]);

    const result = await wikiRead.execute({ slug: "dup-page" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.outbound_wikilinks).toEqual(["a", "b"]);
    }
  });

  it("readPage 예외 → unknown", async () => {
    makeSelectChain([
      {
        slug: "err-page",
        title: "Err",
        path: "wiki/ws/err.md",
        sensitivity: "INTERNAL",
        requiredPermission: null,
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk error"));

    const result = await wikiRead.execute({ slug: "err-page" }, ctx);
    expect(result).toEqual({ ok: false, code: "unknown", error: "disk error" });
  });

  // new ACL tests
  it("draft 페이지 → forbidden", async () => {
    makeSelectChain([
      {
        slug: "draft-page",
        title: "Draft",
        path: "wiki/ws/draft.md",
        sensitivity: "INTERNAL",
        requiredPermission: null,
        publishedStatus: "draft",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await wikiRead.execute({ slug: "draft-page" }, ctx);
    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      error: expect.any(String),
    });
  });

  it("requiredPermission 부족 → forbidden", async () => {
    makeSelectChain([
      {
        slug: "secret-doc",
        title: "Secret",
        path: "wiki/ws/secret.md",
        sensitivity: "INTERNAL",
        requiredPermission: "project.access:secret",
        publishedStatus: "published",
      },
    ]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await wikiRead.execute({ slug: "secret-doc" }, ctx);
    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      error: expect.any(String),
    });
  });
});
