/**
 * packages/ai/__tests__/page-first-shortlist.test.ts
 *
 * X2 — packages/ai page-first 단위 테스트 보강 (shortlist).
 *
 * 목표: sensitivity × permission × requiredPermission 경계 케이스를 전부
 * 검증한다. DB 레이어(`db.execute`) 는 mock 하고, 앱 레이어 필터
 * (`requiredPermission`) 및 `buildWikiSensitivitySqlFilter` 가 호출 인자에
 * 제대로 반영되는지 함께 확인한다.
 *
 * 참고:
 *   - `buildWikiSensitivitySqlFilter` 는 허용 sensitivity 리스트를 SQL 조각에
 *     박는다 — 따라서 mock 은 이미 "필터된 행"만 돌려주는 것처럼 동작하면
 *     충분하고, 여기서는 SQL 조각 자체가 기대대로 만들어졌는지(즉, 올바른
 *     sensitivity 목록을 포함하는지)를 마지막 쿼리 인자에서 검사한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

// DB client mock.
vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

// 나머지 mocks (shortlist 자체는 budget / logger / openai / wiki-fs 를
// 사용하지 않지만, 모듈 그래프 import 연쇄로 묶여 들어올 수 있으므로
// 동일한 mock 을 둔다.)
vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(async () => "---\ntitle: Fake\n---\n\nBody"),
  wikiRoot: () => "/tmp/wiki",
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  recordBlocked: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

vi.mock("../logger.js", () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

import { lexicalShortlist } from "../page-first/shortlist.js";
import { db } from "@jarvis/db/client";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const WS = "00000000-0000-0000-0000-0000000000aa";

function resetDb() {
  vi.mocked(db.execute).mockReset();
}

/**
 * drizzle sql`…` 을 db.execute 에 넘겼을 때 그 안에 담긴 파라미터를 끄집어
 * 내는 헬퍼. drizzle `SQL` 인스턴스는 `.queryChunks` 에 SQL 조각 + 파라미터를
 * 함께 싣는다. 여기서는 `.toQuery` 대신 단순히 queryChunks 를 JSON 직렬화해
 * 인자 목록을 문자열에서 확인한다.
 */
function stringifyQuery(sql: unknown): string {
  try {
    return JSON.stringify(sql, (_key, value) => {
      // Date 는 ISO 로 깔끔히.
      if (value instanceof Date) return value.toISOString();
      return value;
    });
  } catch {
    return String(sql);
  }
}

describe("lexicalShortlist — sensitivity × permission × requiredPermission", () => {
  beforeEach(resetDb);

  // ---------------------------------------------------------------------
  // 1) KNOWLEDGE_READ만 → PUBLIC/INTERNAL 만 SQL 허용 (RESTRICTED 제외)
  // ---------------------------------------------------------------------
  it("KNOWLEDGE_READ only: SQL filter allows PUBLIC/INTERNAL but not RESTRICTED", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "a.md",
          title: "Alpha",
          slug: "alpha",
          sensitivity: "INTERNAL",
          required_permission: null,
          updated_at: new Date(),
          score: 9,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      question: "alpha 정책",
    });

    const passedSql = vi.mocked(db.execute).mock.calls[0]?.[0];
    const serialized = stringifyQuery(passedSql);
    expect(serialized).toContain("'PUBLIC'");
    expect(serialized).toContain("'INTERNAL'");
    expect(serialized).not.toContain("'RESTRICTED'");
    expect(serialized).not.toContain("'SECRET_REF_ONLY'");
  });

  // ---------------------------------------------------------------------
  // 2) KNOWLEDGE_READ + KNOWLEDGE_REVIEW → RESTRICTED 포함
  // ---------------------------------------------------------------------
  it("KNOWLEDGE_READ + KNOWLEDGE_REVIEW: SQL filter adds RESTRICTED", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.KNOWLEDGE_REVIEW,
      ],
      question: "민감 정책",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    expect(serialized).toContain("'PUBLIC'");
    expect(serialized).toContain("'INTERNAL'");
    expect(serialized).toContain("'RESTRICTED'");
    expect(serialized).not.toContain("'SECRET_REF_ONLY'");
  });

  // ---------------------------------------------------------------------
  // 3) ADMIN_ALL → sensitivity filter 없음 (SQL 에 IN 절 자체 부재)
  // ---------------------------------------------------------------------
  it("ADMIN_ALL: no sensitivity IN-clause is emitted (full pass-through)", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.ADMIN_ALL],
      question: "비밀 문서",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    // admin 은 sensitivity IN (...) 절 자체가 주입되지 않는다.
    expect(serialized).not.toMatch(/sensitivity\s+IN\s*\(/i);
  });

  // ---------------------------------------------------------------------
  // 4) SYSTEM_ACCESS_SECRET → SECRET_REF_ONLY 포함
  // ---------------------------------------------------------------------
  it("SYSTEM_ACCESS_SECRET (+ KNOWLEDGE_READ): SQL filter includes SECRET_REF_ONLY", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.SYSTEM_ACCESS_SECRET,
      ],
      question: "시크릿",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    expect(serialized).toContain("'SECRET_REF_ONLY'");
    expect(serialized).toContain("'PUBLIC'");
    expect(serialized).toContain("'INTERNAL'");
  });

  // ---------------------------------------------------------------------
  // 5) 권한 없음 → AND 1 = 0, DB가 빈 결과 반환
  // ---------------------------------------------------------------------
  it("empty permissions: SQL filter collapses to AND 1 = 0 and returns no hits", async () => {
    // 권한이 없으면 실제로는 DB가 빈 결과를 반환한다. mock 도 동일 행동.
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const hits = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [],
      question: "아무거나",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    expect(serialized).toContain("1 = 0");
    expect(hits).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // 6) requiredPermission — now enforced in SQL WHERE (push-down).
  //    The mock simulates the DB already filtering by requiredPermission.
  //    We verify the SQL contains the requiredPermission WHERE clause and
  //    that the app layer correctly maps results.
  // ---------------------------------------------------------------------
  it("requiredPermission: SQL WHERE filters by permission; app layer maps results", async () => {
    // 케이스 A — 권한 없음: DB only returns p1 (p2 filtered out by SQL WHERE).
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "a.md",
          title: "Alpha",
          slug: "alpha",
          sensitivity: "INTERNAL",
          required_permission: null,
          updated_at: new Date(),
          score: 9,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const without = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      question: "alpha beta",
    });
    expect(without.map((h) => h.id)).toEqual(["p1"]);

    // Verify SQL contains required_permission WHERE clause.
    const serializedA = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    expect(serializedA).toContain("required_permission IS NULL");
    expect(serializedA).toContain("required_permission = ANY");

    // 케이스 B — 권한 있음: DB returns both p1 and p2.
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "a.md",
          title: "Alpha",
          slug: "alpha",
          sensitivity: "INTERNAL",
          required_permission: null,
          updated_at: new Date(),
          score: 9,
        },
        {
          id: "p2",
          path: "b.md",
          title: "Beta",
          slug: "beta",
          sensitivity: "INTERNAL",
          required_permission: PERMISSIONS.USER_READ,
          updated_at: new Date(),
          score: 8,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const withPerm = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.USER_READ],
      question: "alpha beta",
    });
    expect(withPerm.map((h) => h.id).sort()).toEqual(["p1", "p2"]);

    // 케이스 C — admin:all 은 SQL WHERE 가 통과시킨다.
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p2",
          path: "b.md",
          title: "Beta",
          slug: "beta",
          sensitivity: "RESTRICTED",
          required_permission: "some:weird:perm",
          updated_at: new Date(),
          score: 8,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const withAdmin = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.ADMIN_ALL],
      question: "beta",
    });
    expect(withAdmin).toHaveLength(1);
    expect(withAdmin[0]?.id).toBe("p2");
  });

  // ---------------------------------------------------------------------
  // 7) topK 기본값 20 → SQL LIMIT = topK * 3 (overfetch for perm filtering)
  // ---------------------------------------------------------------------
  it("topK defaults to 20 — SQL LIMIT is topK*3=60 (overfetch)", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      question: "policy",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    // drizzle 은 LIMIT ${fetchLimit} 의 파라미터 값도 직렬화 결과에 담는다.
    // topK=20, fetchLimit = topK*3 = 60.
    expect(serialized).toContain("60");
    expect(serialized).toMatch(/LIMIT/i);
  });

  // ---------------------------------------------------------------------
  // 8) topK 커스텀 값 전달 — SQL LIMIT = topK * 3
  // ---------------------------------------------------------------------
  it("topK override is passed through to the SQL LIMIT as topK*3", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      question: "policy",
      topK: 5,
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    // topK=5, fetchLimit = 5*3 = 15.
    expect(serialized).toContain("15");
    expect(serialized).toMatch(/LIMIT/i);
  });

  // ---------------------------------------------------------------------
  // 9) 질문 토큰화 — 의미있는 토큰이 unnest(tokenArray) 인자로 전달된다
  // ---------------------------------------------------------------------
  it("tokenizes question and passes tokens as array params for unnest scoring", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      question: "vacation policy 연차",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    // Tokens are passed as array elements to unnest() — not as inline %tok% patterns.
    // The SQL uses `'%' || t || '%'` for ILIKE matching within the unnest subquery.
    expect(serialized).toContain('"vacation"');
    expect(serialized).toContain('"policy"');
    expect(serialized).toContain('"연차"');
  });

  // ---------------------------------------------------------------------
  // 10) stopword/짧은 토큰 제거 (2자 미만 및 '뭐야' 계열)
  // ---------------------------------------------------------------------
  it("drops stopwords and <2-char fragments from the token array", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await lexicalShortlist({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      // "뭐야" 는 stopword, "a" 는 1자라 둘 다 드랍되어야 한다.
      question: "뭐야 a vacation",
    });

    const serialized = stringifyQuery(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    // Tokens are passed as array elements; stopwords and short fragments excluded.
    expect(serialized).toContain('"vacation"');
    expect(serialized).not.toContain('"뭐야"');
    // "a" is 1 char and dropped; but we can't just check for not containing "a"
    // since it appears in many places. Check token array doesn't include it.
    // The token array in the serialized output should be ["vacation"] only.
    expect(serialized).toMatch(/\["vacation"\]/);
  });
});
