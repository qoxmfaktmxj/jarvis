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

// ---- import after mocks ---------------------------------------------------

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
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

// ---- tests ---------------------------------------------------------------

describe("wikiGraphQuery tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
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

  // 4. wiki-page 노드는 추가 ACL 필터 없이 그대로 반환 (D4=A 결정)
  it("returns wiki-page nodes as-is without DB ACL filter", async () => {
    const payload = {
      nodes: [
        { id: "wiki-a", label: "Page A", kind: "wiki-page" },
        { id: "wiki-b", label: "Page B", kind: "wiki-page" },
        { id: "concept-x", label: "Concept", kind: "concept" },
      ],
      edges: [
        { source: "wiki-a", target: "concept-x", relation: "mentions" },
        { source: "wiki-b", target: "concept-x", relation: "mentions" },
        { source: "wiki-a", target: "wiki-b", relation: "links" },
      ],
    };
    makeExecFileOk(payload);

    const result = await wikiGraphQuery.execute({ mode: "search", query: "pages" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const nodeIds = result.data.nodes.map((n) => n.id);
      expect(nodeIds).toEqual(["wiki-a", "wiki-b", "concept-x"]);
      expect(result.data.edges).toHaveLength(3);
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
