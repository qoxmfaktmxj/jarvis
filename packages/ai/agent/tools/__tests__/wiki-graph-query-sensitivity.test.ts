// packages/ai/agent/tools/__tests__/wiki-graph-query-sensitivity.test.ts
// HIGH-4: sensitivity 필터가 쿼리 레벨(WHERE inArray)에서 적용됨을 검증
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
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
}));

vi.mock("@jarvis/auth/rbac", () => ({
  getAllowedWikiSensitivityValues: vi.fn(),
}));

// ---- imports after mocks -------------------------------------------------

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { db } from "@jarvis/db/client";
import { inArray } from "drizzle-orm";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import { wikiGraphQuery } from "../wiki-graph-query.js";

// ---- helpers -------------------------------------------------------------

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

function makeExecFileOk(payload: object) {
  execFileMock.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: object,
      cb: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      cb(null, { stdout: JSON.stringify(payload), stderr: "" });
    }
  );
}

function mockDbSelect(rows: Array<{ slug: string }>) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

const restrictedCtx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-restricted",
  permissions: ["knowledge:read"],
};

const adminCtx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-admin",
  permissions: ["knowledge:read", "admin:all"],
};

describe("wikiGraphQuery — HIGH-4 sensitivity WHERE filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  it("calls getAllowedWikiSensitivityValues with ctx.permissions", async () => {
    (getAllowedWikiSensitivityValues as ReturnType<typeof vi.fn>).mockReturnValue(["PUBLIC", "INTERNAL"]);
    mockDbSelect([]);

    makeExecFileOk({
      nodes: [{ id: "wiki-page-1", label: "Page", kind: "wiki-page" }],
      edges: [],
    });

    await wikiGraphQuery.execute({ mode: "search", query: "test" }, restrictedCtx);

    expect(getAllowedWikiSensitivityValues).toHaveBeenCalledWith([...restrictedCtx.permissions]);
  });

  it("passes allowedSensitivities to inArray WHERE clause (not post-filter)", async () => {
    const allowedSensitivities = ["PUBLIC", "INTERNAL"];
    (getAllowedWikiSensitivityValues as ReturnType<typeof vi.fn>).mockReturnValue(allowedSensitivities);
    mockDbSelect([{ slug: "wiki-page-1" }]);

    makeExecFileOk({
      nodes: [{ id: "wiki-page-1", label: "Page", kind: "wiki-page" }],
      edges: [],
    });

    await wikiGraphQuery.execute({ mode: "search", query: "test" }, restrictedCtx);

    // inArray가 sensitivity 컬럼 + allowedSensitivities 배열로 호출됨
    const inArrayCalls = (inArray as ReturnType<typeof vi.fn>).mock.calls;
    const sensitivityCall = inArrayCalls.find(
      (call: unknown[]) => call[1] === allowedSensitivities
    );
    expect(sensitivityCall).toBeDefined();
  });

  it("RESTRICTED 권한 없는 사용자 — DB가 허용된 슬러그만 반환하면 그것만 visible", async () => {
    (getAllowedWikiSensitivityValues as ReturnType<typeof vi.fn>).mockReturnValue(["PUBLIC", "INTERNAL"]);
    // DB에서 이미 필터됨 — RESTRICTED 페이지는 rows에 없음
    mockDbSelect([{ slug: "wiki-allowed" }]);

    makeExecFileOk({
      nodes: [
        { id: "wiki-allowed", label: "Allowed", kind: "wiki-page" },
        { id: "wiki-restricted", label: "Secret", kind: "wiki-page" },
        { id: "concept-x", label: "Concept", kind: "concept" },
      ],
      edges: [
        { source: "wiki-allowed", target: "concept-x", relation: "mentions" },
        { source: "wiki-restricted", target: "concept-x", relation: "mentions" },
      ],
    });

    const result = await wikiGraphQuery.execute(
      { mode: "search", query: "pages" },
      restrictedCtx
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const nodeIds = result.data.nodes.map((n) => n.id);
      expect(nodeIds).toContain("wiki-allowed");
      expect(nodeIds).toContain("concept-x");
      expect(nodeIds).not.toContain("wiki-restricted");
      // wiki-restricted 관련 edge 제거
      expect(result.data.edges).toHaveLength(1);
    }
  });

  it("ADMIN 권한 — getAllowedWikiSensitivityValues가 모든 sensitivity 반환하면 전부 통과", async () => {
    (getAllowedWikiSensitivityValues as ReturnType<typeof vi.fn>).mockReturnValue([
      "PUBLIC",
      "INTERNAL",
      "RESTRICTED",
      "SECRET_REF_ONLY",
    ]);
    mockDbSelect([{ slug: "wiki-allowed" }, { slug: "wiki-secret" }]);

    makeExecFileOk({
      nodes: [
        { id: "wiki-allowed", label: "Allowed", kind: "wiki-page" },
        { id: "wiki-secret", label: "Secret", kind: "wiki-page" },
      ],
      edges: [{ source: "wiki-allowed", target: "wiki-secret", relation: "links" }],
    });

    const result = await wikiGraphQuery.execute(
      { mode: "search", query: "all pages" },
      adminCtx
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.nodes).toHaveLength(2);
      expect(result.data.edges).toHaveLength(1);
    }
  });
});
