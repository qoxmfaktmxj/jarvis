// apps/web/app/(app)/wiki/manual/[workspaceId]/edit/[...path]/actions.test.ts
//
// Integration tests for saveWikiPage() — verifies that:
//   1. db.transaction() is called so projection + audit_log land atomically.
//   2. projectManualPage helper (shared with worker ingest lane) is invoked
//      with the correct frontmatter/body/commit/user args.
//   3. audit_log row is written inside the same tx (F4 fix).
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
  projectManualPageMock,
  writeAuditLogMock,
  gitWriteAndCommitMock,
  parseFrontmatterMock,
  serializeFrontmatterMock,
  getWikiRepoRootMock,
} = vi.hoisted(() => {
  const projectManualPageMock = vi.fn().mockResolvedValue("page-uuid-mock");
  const writeAuditLogMock = vi.fn().mockResolvedValue(undefined);
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
    projectManualPageMock,
    writeAuditLogMock,
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
  projectManualPage: projectManualPageMock,
}));

// audit_log 스키마 / writeAuditLog 헬퍼: F2/F4 fix 이후 actions.ts 가 임포트한다.
vi.mock("@jarvis/db/schema/audit", () => ({
  auditLog: { id: "id" },
}));

vi.mock("@jarvis/shared/audit-log", () => ({
  writeAuditLog: writeAuditLogMock,
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

  it("calls projectManualPage inside the transaction with correct args", async () => {
    await saveWikiPage(VALID_PAYLOAD);

    expect(projectManualPageMock).toHaveBeenCalledTimes(1);
    const [_tx, opts] = projectManualPageMock.mock.calls[0] as [unknown, { workspaceId: string; sourcePath: string; body: string; commitSha: string; userId: string; slug: string }];
    expect(opts.workspaceId).toBe("ws1");
    expect(opts.sourcePath).toBe("wiki/ws1/manual/manual/foo.md");
    expect(opts.body).toContain("[[bar]]");
    expect(opts.commitSha).toBe("abc123");
    expect(opts.userId).toBe("user-1");
    expect(opts.slug).toBe("manual/foo");
  });

  it("writes audit_log inside the same transaction (F4 fix)", async () => {
    await saveWikiPage(VALID_PAYLOAD);

    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    const [_tx, _auditTable, input] = writeAuditLogMock.mock.calls[0] as [
      unknown,
      unknown,
      { action: string; resourceType: string; workspaceId: string; userId: string; details: { commitSha: string } },
    ];
    expect(input.action).toBe("wiki.manual.save");
    expect(input.resourceType).toBe("wiki_page");
    expect(input.workspaceId).toBe("ws1");
    expect(input.userId).toBe("user-1");
    expect(input.details.commitSha).toBe("abc123");
  });

  it("body with [[foo]] → projectManualPage body contains [[foo]]", async () => {
    parseFrontmatterMock
      .mockReset()
      .mockReturnValueOnce({ body: "See [[foo]] here", data: { title: "Foo" } })
      .mockReturnValueOnce({ body: "See [[foo]] here", data: { title: "Foo", type: "concept" } });

    await saveWikiPage({ ...VALID_PAYLOAD, markdown: "---\ntitle: Foo\n---\nSee [[foo]] here" });

    const [, opts] = projectManualPageMock.mock.calls[0] as [unknown, { body: string }];
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

  it("projection_failed when projectManualPage throws inside transaction", async () => {
    projectManualPageMock.mockRejectedValueOnce(new Error("manual page projection error"));
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
    expect(projectManualPageMock).not.toHaveBeenCalled();
  });

  // Code review HIGH E — frontmatter 의 type/requiredPermission/sensitivity 가
  // projection 으로 전달되어야 ACL/projection 정합성이 유지된다. F2 fix 이후로 이 검증은
  // projectManualPage 헬퍼 (packages/wiki-agent) 가 책임지지만, server action 이 헬퍼에
  // 정확한 frontmatter 를 넘기는지는 여전히 보장해야 한다.
  it("projectManualPage receives frontmatter with type/requiredPermission/sensitivity (HIGH E)", async () => {
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

    await saveWikiPage(VALID_PAYLOAD);

    expect(projectManualPageMock).toHaveBeenCalledTimes(1);
    const [, opts] = projectManualPageMock.mock.calls[0] as [
      unknown,
      {
        frontmatter: Record<string, unknown>;
        commitSha: string;
        sourcePath: string;
      },
    ];
    expect(opts.frontmatter.type).toBe("runbook");
    expect(opts.frontmatter.sensitivity).toBe("RESTRICTED");
    expect(opts.frontmatter.requiredPermission).toBe("project.access:secret");
    expect(opts.frontmatter.title).toBe("Sensitive Page");
    expect(opts.commitSha).toBe("abc123");
    expect(opts.sourcePath).toBe("wiki/ws1/manual/manual/foo.md");
  });
});
