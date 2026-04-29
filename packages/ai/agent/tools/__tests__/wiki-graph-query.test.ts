// packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../types.js";

// ---- mocks ---------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  wikiPageIndex: {
    slug: "slug",
    sensitivity: "sensitivity",
    workspaceId: "workspace_id",
    requiredPermission: "requiredPermission",
    publishedStatus: "publishedStatus",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
}));

vi.mock("@jarvis/auth", () => ({
  canViewWikiPage: vi.fn(),
  PERMISSIONS: { ADMIN_ALL: "admin:all" },
}));

// ---- import after mocks ---------------------------------------------------

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { db } from "@jarvis/db/client";
import { canViewWikiPage } from "@jarvis/auth";
import { wikiGraphQuery } from "../wiki-graph-query.js";

// ---- helpers -------------------------------------------------------------

const ctx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["knowledge:read"],
};

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

function makeExecFileOk(payload: object) {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: JSON.stringify(payload), stderr: "" });
    }
  );
}

function makeExecFileError(message: string) {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: (err: Error) => void) => {
      cb(new Error(message));
    }
  );
}

function mockDbSelect(rows: Array<{ slug: string; sensitivity: string; requiredPermission?: string | null; publishedStatus?: string }>) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

// ---- tests ---------------------------------------------------------------

describe("wikiGraphQuery tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockDbSelect([]);
  });

  // 1. graph.json 없음 → not_found
  it("returns not_found when graph.json does not exist", async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await wikiGraphQuery.execute({ mode: "search", query: "hello" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_found");
    }
  });

  // 2. neighbors 모드, node 미지정 → invalid
  it("returns invalid when neighbors mode has no node", async () => {
    const result = await wikiGraphQuery.execute({ mode: "neighbors" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  // 2b. community 모드, node 미지정 → invalid
  it("returns invalid when community mode has no node", async () => {
    const result = await wikiGraphQuery.execute({ mode: "community" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  // 2c. path 모드, target 미지정 → invalid
  it("returns invalid when path mode has no target", async () => {
    const result = await wikiGraphQuery.execute({ mode: "path", node: "A" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  // 2d. search 모드, query 미지정 → invalid
  it("returns invalid when search mode has no query", async () => {
    const result = await wikiGraphQuery.execute({ mode: "search" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  // 3. search 모드 정상 → nodes/edges 반환
  it("returns nodes and edges for search mode", async () => {
    const payload = {
      nodes: [
        { id: "concept-1", label: "CI/CD", kind: "concept" },
        { id: "concept-2", label: "Docker", kind: "concept" },
      ],
      edges: [
        { source: "concept-1", target: "concept-2", relation: "uses" },
      ],
      summary: "CI/CD uses Docker",
    };
    makeExecFileOk(payload);

    const result = await wikiGraphQuery.execute({ mode: "search", query: "CI pipeline" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.nodes).toHaveLength(2);
      expect(result.data.edges).toHaveLength(1);
      expect(result.data.summary).toBe("CI/CD uses Docker");
    }
  });

  // 4. wiki-page kind 중 ACL forbidden → 해당 node 와 관련 edge 제외
  it("filters out wiki-page nodes with forbidden ACL and their edges", async () => {
    const payload = {
      nodes: [
        { id: "wiki-allowed", label: "Allowed Page", kind: "wiki-page" },
        { id: "wiki-forbidden", label: "Secret Page", kind: "wiki-page" },
        { id: "concept-x", label: "Concept", kind: "concept" },
      ],
      edges: [
        { source: "wiki-allowed", target: "concept-x", relation: "mentions" },
        { source: "wiki-forbidden", target: "concept-x", relation: "mentions" },
        { source: "wiki-allowed", target: "wiki-forbidden", relation: "links" },
      ],
    };
    makeExecFileOk(payload);

    mockDbSelect([
      { slug: "wiki-allowed", sensitivity: "INTERNAL", requiredPermission: null, publishedStatus: "published" },
      { slug: "wiki-forbidden", sensitivity: "SECRET_REF_ONLY", requiredPermission: null, publishedStatus: "published" },
    ]);

    (canViewWikiPage as ReturnType<typeof vi.fn>).mockImplementation(
      (subject: { sensitivity: string }) => subject.sensitivity !== "SECRET_REF_ONLY"
    );

    const result = await wikiGraphQuery.execute({ mode: "search", query: "pages" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const nodeIds = result.data.nodes.map((n) => n.id);
      expect(nodeIds).toContain("wiki-allowed");
      expect(nodeIds).toContain("concept-x");
      expect(nodeIds).not.toContain("wiki-forbidden");

      // wiki-forbidden 관련 edge 모두 제거됨
      expect(result.data.edges).toHaveLength(1);
      expect(result.data.edges[0]).toMatchObject({ source: "wiki-allowed", target: "concept-x" });
    }
  });

  // 4b. draft wiki-page는 visible 집합에서 제외
  it("그래프 노드 중 draft인 wiki-page는 visible 집합에서 제외", async () => {
    const payload = {
      nodes: [
        { id: "wiki-published", label: "Published", kind: "wiki-page" },
        { id: "wiki-draft", label: "Draft Page", kind: "wiki-page" },
        { id: "concept-y", label: "Concept", kind: "concept" },
      ],
      edges: [
        { source: "wiki-published", target: "concept-y", relation: "mentions" },
        { source: "wiki-draft", target: "concept-y", relation: "mentions" },
      ],
    };
    makeExecFileOk(payload);

    mockDbSelect([
      { slug: "wiki-published", sensitivity: "INTERNAL", requiredPermission: null, publishedStatus: "published" },
      { slug: "wiki-draft", sensitivity: "INTERNAL", requiredPermission: null, publishedStatus: "draft" },
    ]);

    // published는 true, draft는 false
    (canViewWikiPage as ReturnType<typeof vi.fn>).mockImplementation(
      (subject: { publishedStatus: string }) => subject.publishedStatus === "published"
    );

    const result = await wikiGraphQuery.execute({ mode: "search", query: "pages" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const nodeIds = result.data.nodes.map((n) => n.id);
      expect(nodeIds).toContain("wiki-published");
      expect(nodeIds).toContain("concept-y");
      expect(nodeIds).not.toContain("wiki-draft");

      // wiki-draft 관련 edge 제거됨
      expect(result.data.edges).toHaveLength(1);
      expect(result.data.edges[0]).toMatchObject({ source: "wiki-published", target: "concept-y" });
    }
  });

  // 5. execFile timeout → code: "timeout"
  it("returns timeout error on execFile timeout", async () => {
    makeExecFileError("Command timed out: ETIMEDOUT");
    const result = await wikiGraphQuery.execute({ mode: "search", query: "anything" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
    }
  });

  // 6. execFile 예외 → code: "unknown"
  it("returns unknown error on generic execFile failure", async () => {
    makeExecFileError("graphify: command not found");
    const result = await wikiGraphQuery.execute({ mode: "search", query: "anything" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });

  // 7. stdout JSON 파싱 실패 → unknown
  it("returns unknown error when stdout is invalid JSON", async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
        cb(null, { stdout: "not-valid-json{{{", stderr: "" });
      }
    );
    const result = await wikiGraphQuery.execute({ mode: "search", query: "anything" }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });

  // 8. neighbors 모드 정상 — graphify 에 올바른 args 전달
  it("builds correct args for neighbors mode", async () => {
    makeExecFileOk({ nodes: [], edges: [] });
    await wikiGraphQuery.execute({ mode: "neighbors", node: "TypeScript", budget: 500 }, ctx);

    const call = execFileMock.mock.calls[0] as unknown[];
    expect(call[0]).toBe("graphify");
    expect(call[1]).toEqual(expect.arrayContaining(["query", "neighbors of TypeScript", "--budget", "500", "--json"]));
  });

  // 9. path 모드 정상 — graphify 에 올바른 args 전달
  it("builds correct args for path mode", async () => {
    makeExecFileOk({ nodes: [], edges: [] });
    await wikiGraphQuery.execute({ mode: "path", node: "A", target: "B" }, ctx);

    const call = execFileMock.mock.calls[0] as unknown[];
    expect(call[1]).toEqual(["path", "A", "B", "--graph", expect.any(String), "--json"]);
  });
});
