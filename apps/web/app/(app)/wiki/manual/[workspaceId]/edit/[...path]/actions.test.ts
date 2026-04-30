// apps/web/app/(app)/wiki/manual/[workspaceId]/edit/[...path]/actions.test.ts
//
// Integration tests for saveWikiPage() — verifies that:
//   1. db.transaction() is called (index + link projection are atomic).
//   2. wiki_page_link projection (projectLinks) is called inside the tx.
//   3. body with [[foo]] → projectLinks receives body containing [[foo]].
//   4. projection_failed is returned when tx throws.

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted: define all mock functions before module resolution
// ---------------------------------------------------------------------------
const {
  cookiesMock,
  headersMock,
  getSessionMock,
  hasPermissionMock,
  dbSelectMock,
  dbTransactionMock,
  projectLinksMock,
  gitWriteAndCommitMock,
  parseFrontmatterMock,
  serializeFrontmatterMock,
  getWikiRepoRootMock,
} = vi.hoisted(() => {
  const projectLinksMock = vi.fn().mockResolvedValue(undefined);
  const dbTransactionMock = vi.fn();

  // select chain: .select().from().where().limit()
  const dbSelectMock = vi.fn();

  const gitWriteAndCommitMock = vi.fn().mockResolvedValue({ sha: "abc123" });

  const parseFrontmatterMock = vi.fn();
  const serializeFrontmatterMock = vi.fn().mockReturnValue("---\ntitle: Test\n---\nbody");

  return {
    cookiesMock: vi.fn(),
    headersMock: vi.fn(),
    getSessionMock: vi.fn(),
    hasPermissionMock: vi.fn(),
    dbSelectMock,
    dbTransactionMock,
    projectLinksMock,
    gitWriteAndCommitMock,
    parseFrontmatterMock,
    serializeFrontmatterMock,
    getWikiRepoRootMock: vi.fn().mockReturnValue("/tmp/wiki-root"),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock("@jarvis/shared/constants", () => ({
  PERMISSIONS: { KNOWLEDGE_UPDATE: "knowledge:update" },
}));

vi.mock("@jarvis/shared/validation", () => ({
  wikiSavePayloadSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: dbSelectMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@jarvis/db/schema/wiki-page-index", () => ({
  wikiPageIndex: {
    workspaceId: "workspace_id",
    path: "path",
    sensitivity: "sensitivity",
    requiredPermission: "required_permission",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
}));

vi.mock("@jarvis/wiki-fs", () => ({
  GitRepo: vi.fn().mockImplementation(() => ({
    writeAndCommit: gitWriteAndCommitMock,
  })),
  defaultBotAuthor: vi.fn().mockReturnValue({ name: "jarvis-bot", email: "bot@jarvis" }),
  parseFrontmatter: parseFrontmatterMock,
  serializeFrontmatter: serializeFrontmatterMock,
}));

vi.mock("@/lib/server/repo-root", () => ({
  getWikiRepoRoot: getWikiRepoRootMock,
}));

vi.mock("@jarvis/wiki-agent/projection", () => ({
  projectLinks: projectLinksMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SESSION = {
  userId: "user-1",
  workspaceId: "ws1",
  role: "admin",
};

const VALID_PAYLOAD = {
  workspaceId: "ws1",
  pageSlug: "manual/foo",
  markdown: "---\ntitle: Foo\n---\nBody text [[bar]]",
  frontmatter: { title: "Foo" },
};

function setupHeaders(sessionId = "sess-123") {
  headersMock.mockResolvedValue({ get: (k: string) => (k === "x-session-id" ? sessionId : null) });
  cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
}

function setupSession() {
  getSessionMock.mockResolvedValue(SESSION);
  hasPermissionMock.mockReturnValue(true);
}

function setupSelect(sensitivity = "INTERNAL", requiredPermission = "knowledge:read") {
  const limitMock = vi.fn().mockResolvedValue([{ sensitivity, requiredPermission }]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  dbSelectMock.mockReturnValue({ from: fromMock });
}

function setupParseFrontmatter(body = "Body text [[bar]]") {
  // First call: parseFrontmatter(payload.markdown) → incomingBody
  // Second call: parseFrontmatter(fileContent) → fmData for projection
  parseFrontmatterMock
    .mockReturnValueOnce({ body, data: { title: "Foo" } })
    .mockReturnValueOnce({ body, data: { title: "Foo", type: "concept" } });
}

function setupTransaction(txImpl?: (tx: unknown) => Promise<void>) {
  dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    return fn(txImpl ? (await txImpl(tx), tx) : tx);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
import { saveWikiPage } from "./actions.js";

describe("saveWikiPage() — wiki_page_link projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHeaders();
    setupSession();
    setupSelect();
    setupParseFrontmatter();
    setupTransaction();
  });

  it("calls db.transaction() — index upsert and projectLinks are atomic", async () => {
    const result = await saveWikiPage(VALID_PAYLOAD);
    expect(result.ok).toBe(true);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("calls projectLinks inside the transaction with correct args", async () => {
    await saveWikiPage(VALID_PAYLOAD);

    expect(projectLinksMock).toHaveBeenCalledTimes(1);
    const [_tx, opts] = projectLinksMock.mock.calls[0] as [unknown, { workspaceId: string; sourcePath: string; body: string }];
    expect(opts.workspaceId).toBe("ws1");
    expect(opts.sourcePath).toBe("wiki/ws1/manual/manual/foo.md");
    expect(opts.body).toContain("[[bar]]");
  });

  it("body with [[foo]] → projectLinks body contains [[foo]]", async () => {
    parseFrontmatterMock
      .mockReset()
      .mockReturnValueOnce({ body: "See [[foo]] here", data: { title: "Foo" } })
      .mockReturnValueOnce({ body: "See [[foo]] here", data: { title: "Foo", type: "concept" } });

    await saveWikiPage({ ...VALID_PAYLOAD, markdown: "---\ntitle: Foo\n---\nSee [[foo]] here" });

    const [, opts] = projectLinksMock.mock.calls[0] as [unknown, { body: string }];
    expect(opts.body).toContain("[[foo]]");
  });

  it("projection_failed when transaction throws", async () => {
    dbTransactionMock.mockRejectedValue(new Error("DB error"));

    const result = await saveWikiPage(VALID_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("projection_failed");
    }
  });

  it("projection_failed when projectLinks throws inside transaction", async () => {
    projectLinksMock.mockRejectedValueOnce(new Error("link projection error"));
    // transaction re-throws the inner error
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      await fn(tx);
    });

    const result = await saveWikiPage(VALID_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("projection_failed");
    }
  });

  it("forbidden when session missing", async () => {
    getSessionMock.mockResolvedValue(null);
    const result = await saveWikiPage(VALID_PAYLOAD);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("git_failed returns early without calling transaction", async () => {
    gitWriteAndCommitMock.mockRejectedValueOnce(new Error("git error"));

    const result = await saveWikiPage(VALID_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("git_failed");
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(projectLinksMock).not.toHaveBeenCalled();
  });

  // Code review HIGH E — onConflictDoUpdate.set 가 frontmatter 파생 컬럼들을 모두
  // 갱신해야 ACL/projection 정합성이 유지된다. 누락 시 frontmatter 의 권한 강화가
  // DB projection 에 반영되지 않아 검색·page-first·Ask AI 에서 약한 권한이 그대로 사용됨.
  it("onConflictDoUpdate.set includes type/requiredPermission/publishedStatus/sensitivity (HIGH E)", async () => {
    parseFrontmatterMock
      .mockReset()
      .mockReturnValueOnce({
        body: "body",
        data: {
          title: "Sensitive Page",
          type: "runbook",
          sensitivity: "RESTRICTED",
          requiredPermission: "project.access:secret",
        },
      })
      .mockReturnValueOnce({
        body: "body",
        data: {
          title: "Sensitive Page",
          type: "runbook",
          sensitivity: "RESTRICTED",
          requiredPermission: "project.access:secret",
        },
      });

    let capturedSet: Record<string, unknown> | null = null;
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn((cfg: { set: Record<string, unknown> }) => {
              capturedSet = cfg.set;
              return Promise.resolve(undefined);
            }),
          }),
        }),
      };
      await fn(tx);
    });

    await saveWikiPage(VALID_PAYLOAD);

    expect(capturedSet).not.toBeNull();
    const set = capturedSet as unknown as Record<string, unknown>;
    expect(set.type).toBe("runbook");
    expect(set.sensitivity).toBe("RESTRICTED");
    expect(set.requiredPermission).toBe("project.access:secret");
    expect(set.publishedStatus).toBe("published");
    expect(set.authority).toBe("manual");
    expect(set.gitSha).toBe("abc123");
    expect(set.frontmatter).toBeDefined();
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});
