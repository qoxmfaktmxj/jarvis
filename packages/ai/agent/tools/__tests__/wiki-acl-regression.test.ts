// packages/ai/agent/tools/__tests__/wiki-acl-regression.test.ts
//
// 회귀 테스트: "UI에서 안 보이는 페이지는 Ask에서도 안 보인다"
// 4개 fixture × 2개 도구(wiki_read, wiki_follow_link) = 8 케이스

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
    routeKey: "routeKey",
    frontmatter: "frontmatter",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  ilike: vi.fn((col: unknown, pattern: unknown) => ({ col, pattern, op: "ilike" })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _inArray: [col, vals] })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
      op: "sql",
    })),
    { raw: vi.fn((s: string) => ({ raw: s })) }
  ),
}));

vi.mock("@jarvis/auth", () => ({
  canViewWikiPage: vi.fn(),
  resolveAllowedWikiSensitivities: vi.fn(() => ["PUBLIC", "INTERNAL"]),
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
import { wikiFollowLink } from "../wiki-follow-link.js";
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

// ── fixtures ──────────────────────────────────────────────────────────────
const blockedFixtures = [
  {
    label: "draft 페이지",
    row: {
      slug: "draft",
      title: "Draft",
      path: "wiki/ws/draft.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "draft",
    },
  },
  {
    label: "archived 페이지",
    row: {
      slug: "old",
      title: "Old",
      path: "wiki/ws/old.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "archived",
    },
  },
  {
    label: "requiredPermission 부족",
    row: {
      slug: "secret",
      title: "Secret",
      path: "wiki/ws/secret.md",
      sensitivity: "INTERNAL",
      requiredPermission: "project.access:secret",
      publishedStatus: "published",
    },
  },
  {
    label: "RESTRICTED + KNOWLEDGE_REVIEW 미보유",
    row: {
      slug: "restricted",
      title: "Restricted",
      path: "wiki/ws/restricted.md",
      sensitivity: "RESTRICTED",
      requiredPermission: null,
      publishedStatus: "published",
    },
  },
];

// ── tests ──────────────────────────────────────────────────────────────────
describe("wiki tool ACL 회귀 — UI에서 안 보이는 페이지는 Ask에서도 안 보인다", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const fx of blockedFixtures) {
    it(`wiki_read: ${fx.label} → forbidden`, async () => {
      makeSelectChain([fx.row]);
      (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await wikiRead.execute({ slug: fx.row.slug }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("forbidden");
      }
    });

    it(`wiki_follow_link: source가 ${fx.label} → forbidden`, async () => {
      makeSelectChain([fx.row]);
      (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);

      // wiki_follow_link source lookup uses .limit()
      const result = await wikiFollowLink.execute(
        { from_slug: fx.row.slug },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("forbidden");
      }
    });
  }

  // sanity: published + 권한 있으면 통과
  it("published + INTERNAL + 권한 있으면 wiki_read 통과", async () => {
    const row = {
      slug: "open",
      title: "Open",
      path: "wiki/ws/open.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "published",
    };
    makeSelectChain([row]);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readPage as ReturnType<typeof vi.fn>).mockResolvedValue("content");
    (splitFrontmatter as ReturnType<typeof vi.fn>).mockReturnValue({ frontmatter: null, body: "content" });
    (parseWikilinks as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await wikiRead.execute({ slug: "open" }, ctx);
    expect(result.ok).toBe(true);
  });
});
