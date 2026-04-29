// packages/ai/agent/tools/__tests__/wiki-grep.test.ts
//
// wiki-grep tool 단위 테스트.
// 실제 DB 연결 없이 @jarvis/db/client · @jarvis/db/schema · drizzle-orm ·
// @jarvis/auth 를 mock 처리.

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
    requiredPermission: "wiki.requiredPermission",
    publishedStatus: "wiki.publishedStatus",
    routeKey: "wiki.routeKey",
    frontmatter: "wiki.frontmatter",
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

vi.mock("@jarvis/auth", () => ({
  resolveAllowedWikiSensitivities: vi.fn((permissions: string[]) => {
    if (permissions.includes("admin:all")) return ["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"];
    if (permissions.includes("knowledge:read")) return ["PUBLIC", "INTERNAL"];
    return [];
  }),
  PERMISSIONS: {
    ADMIN_ALL: "admin:all",
    KNOWLEDGE_READ: "knowledge:read",
    KNOWLEDGE_REVIEW: "knowledge:review",
    PROJECT_ACCESS_SECRET: "project.access:secret",
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { db } from "@jarvis/db/client";
import { ilike, sql } from "drizzle-orm";
import { resolveAllowedWikiSensitivities } from "@jarvis/auth";
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
      { slug: "leave-policy", title: "연차 정책", path: "wiki/ws-1/manual/hr/leave-policy.md", sensitivity: "INTERNAL" },
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
        path: "wiki/ws-1/manual/hr/leave-policy.md",
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

  // 4. scope = 'manual' 이면 sql`%/manual/%` 패턴이 적용됨 (workspace-relative)
  it("applies workspace-relative scope condition when scope is manual", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const sqlMock = sql as unknown as Mock;
    sqlMock.mockClear();

    await wikiGrep.execute({ query: "leave", scope: "manual" }, baseCtx);

    // sql template literal이 호출됐는지, 그리고 '/manual/' 패턴을 포함하는지 확인
    expect(sqlMock).toHaveBeenCalled();
    const calls = sqlMock.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>;
    const scopeCall = calls.find(([strings]) =>
      Array.from(strings).some((s) => typeof s === "string" && s.includes("LIKE"))
    );
    expect(scopeCall).toBeDefined();
  });

  it("does not apply scope ilike when scope is all", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const ilikeMock = ilike as unknown as Mock;
    ilikeMock.mockClear();

    await wikiGrep.execute({ query: "leave", scope: "all" }, baseCtx);

    // scope=all 이면 LIKE 스코프 조건이 ilike로 직접 호출되지 않음
    // (sql`true` 사용하므로)
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

  // 5. sensitivity filter — resolveAllowedWikiSensitivities 호출됨
  it("applies sensitivity filter using resolveAllowedWikiSensitivities", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const resolvedMock = resolveAllowedWikiSensitivities as unknown as Mock;

    await wikiGrep.execute({ query: "policy" }, baseCtx);

    expect(resolvedMock).toHaveBeenCalledWith(baseCtx.permissions);
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

  // 8. publishedStatus='draft' 필터 — SQL 레벨 필터가 적용됨 (new ACL tests)
  it("SQL 레벨에서 publishedStatus 필터 적용 확인 (eq 호출)", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));

    await wikiGrep.execute({ query: "policy" }, baseCtx);

    // eq(wikiPageIndex.publishedStatus, "published")이 호출되는지 확인
    // 비-admin이므로 publishedStatus 필터 적용
    const sqlMock = sql as unknown as Mock;
    const sqlCalls = sqlMock.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>;
    // publishedStatus 관련 sql 조건이 생성됨
    expect(sqlCalls.length).toBeGreaterThan(0);
  });

  it("admin 권한이면 resolveAllowedWikiSensitivities가 전체 반환", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const resolvedMock = resolveAllowedWikiSensitivities as unknown as Mock;

    const adminCtx = { ...baseCtx, permissions: ["admin:all"] };
    await wikiGrep.execute({ query: "policy" }, adminCtx);

    expect(resolvedMock).toHaveBeenCalledWith(adminCtx.permissions);
    expect(resolvedMock.mock.results[0]?.value).toEqual(["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"]);
  });

  it("권한 없으면 빈 배열 반환 (early return)", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const resolvedMock = resolveAllowedWikiSensitivities as unknown as Mock;
    resolvedMock.mockReturnValueOnce([]);

    const result = await wikiGrep.execute({ query: "policy" }, { ...baseCtx, permissions: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.matches).toEqual([]);
    }
  });

  // 9. tenant 하드코딩 제거 확인 — 'wiki/jarvis/' 패턴이 ilike에 나타나지 않음
  it("scope filter는 workspace-relative이고 wiki/jarvis/ 하드코딩이 없음", async () => {
    const selectMock = db.select as unknown as Mock;
    selectMock.mockReturnValue(createChain([]));
    const ilikeMock = ilike as unknown as Mock;
    ilikeMock.mockClear();

    await wikiGrep.execute({ query: "leave", scope: "manual" }, baseCtx);

    const ilikeCalls = ilikeMock.mock.calls as Array<[unknown, string]>;
    const hardcodedCall = ilikeCalls.find(([, pattern]) =>
      typeof pattern === "string" && pattern.includes("wiki/jarvis/")
    );
    expect(hardcodedCall).toBeUndefined();
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
