// packages/ai/agent/tools/__tests__/wiki-grep.test.ts
//
// wiki-grep tool 단위 테스트.
// 실제 DB 연결 없이 @jarvis/db/client · @jarvis/db/schema · drizzle-orm ·
// @jarvis/auth/rbac 를 mock 처리.

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  wikiPageIndex: {
    workspaceId: "wiki.workspaceId",
    slug: "wiki.slug",
    title: "wiki.title",
    path: "wiki.path",
    sensitivity: "wiki.sensitivity",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ilike: vi.fn((column: unknown, pattern: unknown) => ({ column, pattern, op: "ilike" })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, op: "inArray", values })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
      op: "sql",
    })),
    {
      raw: vi.fn((s: string) => ({ raw: s, op: "sql.raw" })),
    }
  ),
  asc: vi.fn((col: unknown) => col),
}));

vi.mock("@jarvis/auth/rbac", () => ({
  getAllowedWikiSensitivityValues: vi.fn((permissions: string[]) => {
    if (permissions.includes("admin:all")) return ["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"];
    if (permissions.includes("knowledge:read")) return ["PUBLIC", "INTERNAL"];
    return [];
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { db } from "@jarvis/db/client";
import { ilike, inArray } from "drizzle-orm";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import { wikiGrep } from "../wiki-grep.js";
import type { ToolContext } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createChain<T>(value: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(value)),
  };
  return chain;
}

const baseCtx: ToolContext = {
  workspaceId: "ws-1",
  userId: "user-1",
  permissions: ["knowledge:read"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wiki-grep tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. query 2자 미만 → invalid 에러
  it("returns invalid error when query is shorter than 2 chars", async () => {
    const result = await wikiGrep.execute({ query: "a" }, baseCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  it("returns invalid error for empty query", async () => {
    const result = await wikiGrep.execute({ query: "" }, baseCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
    }
  });

  it("returns invalid error for whitespace-only query", async () => {
    const result = await wikiGrep.execute({ query: "  " }, baseCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
      expect(result.error).toMatch(/2 characters/);
    }
  });

  // 2. 정상 쿼리 → matches 배열 반환
  it("returns matches when query is valid", async () => {
    const rows = [
      { slug: "leave-policy", title: "연차 정책", path: "wiki/jarvis/manual/hr/leave-policy.md", sensitivity: "INTERNAL" },
    ];
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain(rows));

    const result = await wikiGrep.execute({ query: "연차" }, baseCtx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.matches).toHaveLength(1);
      expect(result.data.matches[0]).toMatchObject({
        slug: "leave-policy",
        title: "연차 정책",
        path: "wiki/jarvis/manual/hr/leave-policy.md",
        sensitivity: "INTERNAL",
        snippet: "",
      });
    }
  });

  // 3. limit 초과 값이면 clamp (30 제한)
  it("clamps limit to 30 when value exceeds maximum", async () => {
    const selectMock = db.select as unknown as Mock;
    const chain = createChain([]);
    selectMock.mockReturnValue(chain);

    await wikiGrep.execute({ query: "policy", limit: 999 }, baseCtx);

    expect(chain.limit).toHaveBeenCalledWith(30);
  });

  it("clamps limit to 1 when value is below minimum", async () => {
    const selectMock = db.select as unknown as Mock;
    const chain = createChain([]);
    selectMock.mockReturnValue(chain);

    await wikiGrep.execute({ query: "policy", limit: 0 }, baseCtx);

    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("uses default limit 10 when not provided", async () => {
    const selectMock = db.select as unknown as Mock;
    const chain = createChain([]);
    selectMock.mockReturnValue(chain);

    await wikiGrep.execute({ query: "policy" }, baseCtx);

    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  // 4. scope = 'manual' 이면 scopeCond가 ilike로 호출됨
  it("applies ilike scope condition when scope is manual", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const ilikeMock = ilike as unknown as Mock;
    ilikeMock.mockClear();

    await wikiGrep.execute({ query: "leave", scope: "manual" }, baseCtx);

    const ilikeCalls = ilikeMock.mock.calls as Array<[unknown, string]>;
    const scopeCall = ilikeCalls.find(([, pattern]) =>
      typeof pattern === "string" && pattern.includes("/manual/")
    );
    expect(scopeCall).toBeDefined();
  });

  it("does not apply scope ilike when scope is all", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const ilikeMock = ilike as unknown as Mock;
    ilikeMock.mockClear();

    await wikiGrep.execute({ query: "leave", scope: "all" }, baseCtx);

    const ilikeCalls = ilikeMock.mock.calls as Array<[unknown, string]>;
    const scopeCall = ilikeCalls.find(([, pattern]) =>
      typeof pattern === "string" && (
        pattern.includes("/manual/") ||
        pattern.includes("/auto/") ||
        pattern.includes("/procedures/")
      )
    );
    expect(scopeCall).toBeUndefined();
  });

  // 5. sensitivity filter 와 workspace filter가 호출됨
  it("applies sensitivity filter using getAllowedWikiSensitivityValues", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const getAllowedMock = getAllowedWikiSensitivityValues as unknown as Mock;

    await wikiGrep.execute({ query: "policy" }, baseCtx);

    expect(getAllowedMock).toHaveBeenCalledWith(baseCtx.permissions);
  });

  it("applies inArray sensitivity filter from allowed values", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const inArrayMock = inArray as unknown as Mock;
    inArrayMock.mockClear();

    await wikiGrep.execute({ query: "policy" }, { ...baseCtx, permissions: ["knowledge:read"] });

    const inArrayCalls = inArrayMock.mock.calls as Array<[unknown, string[]]>;
    const sensitivityCall = inArrayCalls.find(([col]) => col === "wiki.sensitivity");
    expect(sensitivityCall).toBeDefined();
    expect(sensitivityCall![1]).toEqual(["PUBLIC", "INTERNAL"]);
  });

  // 6. 0 matches → ok({matches:[]})
  it("returns empty matches array when no results found", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));

    const result = await wikiGrep.execute({ query: "nonexistent" }, baseCtx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.matches).toEqual([]);
    }
  });

  // 7. db 예외 → {ok:false, code:"unknown"}
  it("returns unknown error when db throws", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const result = await wikiGrep.execute({ query: "policy" }, baseCtx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
      expect(result.error).toContain("connection refused");
    }
  });

  it("returns unknown error with string message when non-Error thrown", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockImplementation(() => {
      throw "string error";
    });

    const result = await wikiGrep.execute({ query: "policy" }, baseCtx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });

  // tool metadata
  it("has correct tool name and description", () => {
    expect(wikiGrep.name).toBe("wiki_grep");
    expect(wikiGrep.description).toBeTruthy();
  });

  it("has valid JSON schema parameters", () => {
    const params = wikiGrep.parameters as Record<string, unknown>;
    expect(params.type).toBe("object");
    const props = params.properties as Record<string, unknown>;
    expect(props.query).toBeDefined();
    expect(params.required).toContain("query");
  });
});
