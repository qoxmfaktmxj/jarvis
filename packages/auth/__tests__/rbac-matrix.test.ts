import { describe, expect, it } from "vitest";
import {
  buildWikiSensitivitySqlFilter,
  hasPermission,
} from "../rbac.js";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "../types.js";

/**
 * T8 — RBAC matrix test: 5 roles x 4 sensitivities + resource access gates.
 *
 * 전 역할(ADMIN, MANAGER, DEVELOPER, HR, VIEWER) x
 * 전 sensitivity(PUBLIC, INTERNAL, RESTRICTED, SECRET_REF_ONLY) 매트릭스를
 * buildWikiSensitivitySqlFilter 기준으로 검증한다.
 *
 * 추가로 wiki_review_queue(KNOWLEDGE_REVIEW 게이트),
 * wiki_commit_log(KNOWLEDGE_READ 게이트) 접근 매트릭스를 검증한다.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Sensitivity = "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";

/**
 * buildWikiSensitivitySqlFilter 가 생성한 SQL fragment 가 주어진 sensitivity 를
 * 통과시키는지 판정한다.
 *   - 빈 문자열("") → admin 전체 통과
 *   - "AND 1 = 0"   → 전부 차단
 *   - IN (...)       → 리스트 포함 여부 확인
 */
function fragmentAllows(fragment: string, sensitivity: Sensitivity): boolean {
  if (fragment === "") return true;
  if (fragment === "AND 1 = 0") return false;
  const match = fragment.match(/IN \(([^)]+)\)/);
  if (!match) return false;
  return match[1]!.includes(`'${sensitivity}'`);
}

function makeSession(
  role: string,
  overrides?: Partial<JarvisSession>,
): JarvisSession {
  return {
    id: "sess-test",
    userId: "u1",
    workspaceId: "ws1",
    employeeId: "emp1",
    name: "Test User",
    roles: [role],
    permissions: [...((ROLE_PERMISSIONS[role] as string[]) ?? [])],
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600_000,
    ...overrides,
  } as JarvisSession;
}

// ---------------------------------------------------------------------------
// 1. buildWikiSensitivitySqlFilter — 5 roles x 4 sensitivities
// ---------------------------------------------------------------------------

const SENSITIVITIES: Sensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY",
];

const ROLES = ["ADMIN", "MANAGER", "DEVELOPER", "HR", "VIEWER"] as const;

/**
 * Expected matrix:
 *
 * |           | PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY |
 * |-----------|--------|----------|------------|-----------------|
 * | ADMIN     | true   | true     | true       | true            |
 * | MANAGER   | true   | true     | true       | false           |
 * | DEVELOPER | true   | true     | false      | true            |
 * | HR        | true   | true     | false      | false           |
 * | VIEWER    | true   | true     | false      | false           |
 */
const EXPECTED_MATRIX: Record<string, Record<Sensitivity, boolean>> = {
  ADMIN: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: true,
    SECRET_REF_ONLY: true,
  },
  MANAGER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: true,
    SECRET_REF_ONLY: false,
  },
  DEVELOPER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: false,
    SECRET_REF_ONLY: true,
  },
  HR: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: false,
    SECRET_REF_ONLY: false,
  },
  VIEWER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: false,
    SECRET_REF_ONLY: false,
  },
};

describe("RBAC matrix -- wiki_page_index (5 roles x 4 sensitivities)", () => {
  describe.each(
    ROLES.map((role) => ({
      role,
      perms: ROLE_PERMISSIONS[role] as string[],
    })),
  )("role: $role", ({ role, perms }) => {
    const fragment = buildWikiSensitivitySqlFilter(perms);

    it.each(SENSITIVITIES)(
      "buildWikiSensitivitySqlFilter -- sensitivity %s",
      (sensitivity) => {
        const expected = EXPECTED_MATRIX[role]![sensitivity];
        expect(fragmentAllows(fragment, sensitivity)).toBe(expected);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Fragment shape per role
// ---------------------------------------------------------------------------

describe("RBAC matrix -- fragment shape verification", () => {
  it("ADMIN: empty string (no filter)", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.ADMIN as string[],
    );
    expect(frag).toBe("");
  });

  it("MANAGER: IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.MANAGER as string[],
    );
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')",
    );
  });

  it("DEVELOPER: IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.DEVELOPER as string[],
    );
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')",
    );
  });

  it("HR: IN ('PUBLIC', 'INTERNAL')", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.HR as string[],
    );
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
  });

  it("VIEWER: IN ('PUBLIC', 'INTERNAL')", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.VIEWER as string[],
    );
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
  });
});

// ---------------------------------------------------------------------------
// 3. options.column custom column propagation
// ---------------------------------------------------------------------------

describe("RBAC matrix -- options.column custom column", () => {
  it("MANAGER with wpi.sensitivity column", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.MANAGER as string[],
      { column: "wpi.sensitivity" },
    );
    expect(frag).toBe(
      "AND wpi.sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')",
    );
  });

  it("DEVELOPER with wpi.sensitivity column", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.DEVELOPER as string[],
      { column: "wpi.sensitivity" },
    );
    expect(frag).toBe(
      "AND wpi.sensitivity IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')",
    );
  });

  it("ADMIN with custom column still returns empty string", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.ADMIN as string[],
      { column: "wpi.sensitivity" },
    );
    expect(frag).toBe("");
  });

  it("empty permissions with custom column still returns AND 1 = 0", () => {
    const frag = buildWikiSensitivitySqlFilter([], {
      column: "wpi.sensitivity",
    });
    expect(frag).toBe("AND 1 = 0");
  });
});

// ---------------------------------------------------------------------------
// 4. wiki_review_queue access -- KNOWLEDGE_REVIEW gate
// ---------------------------------------------------------------------------

describe("wiki_review_queue access -- KNOWLEDGE_REVIEW gate", () => {
  it.each([
    { role: "ADMIN", expected: true },
    { role: "MANAGER", expected: true },
    { role: "DEVELOPER", expected: false },
    { role: "HR", expected: false },
    { role: "VIEWER", expected: false },
  ] as const)("$role -> canAccessReviewQueue: $expected", ({ role, expected }) => {
    const session = makeSession(role);
    const can =
      hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL);
    expect(can).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 5. wiki_commit_log access -- KNOWLEDGE_READ gate
// ---------------------------------------------------------------------------

describe("wiki_commit_log access -- KNOWLEDGE_READ gate", () => {
  it.each([
    { role: "ADMIN", expected: true },
    { role: "MANAGER", expected: true },
    { role: "DEVELOPER", expected: true },
    { role: "HR", expected: true },
    { role: "VIEWER", expected: true },
  ] as const)("$role -> canAccessCommitLog: $expected", ({ role, expected }) => {
    const session = makeSession(role);
    const can =
      hasPermission(session, PERMISSIONS.KNOWLEDGE_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL);
    expect(can).toBe(expected);
  });

  it("role without KNOWLEDGE_READ cannot access commit log", () => {
    // Fabricate a session with no relevant knowledge permissions
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.NOTICE_READ],
      roles: ["CUSTOM_NOACCESS"],
    });
    const can =
      hasPermission(session, PERMISSIONS.KNOWLEDGE_READ) ||
      hasPermission(session, PERMISSIONS.ADMIN_ALL);
    expect(can).toBe(false);
  });

  it("commit log respects sensitivity filter (same as wiki_page_index)", () => {
    // commit log entries inherit the sensitivity of their wiki page.
    // The same buildWikiSensitivitySqlFilter should be applied.
    // DEVELOPER should NOT see commits on RESTRICTED pages.
    const devPerms = ROLE_PERMISSIONS.DEVELOPER as string[];
    const frag = buildWikiSensitivitySqlFilter(devPerms);
    expect(fragmentAllows(frag, "RESTRICTED")).toBe(false);
    expect(fragmentAllows(frag, "SECRET_REF_ONLY")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe("RBAC matrix -- edge cases", () => {
  it("empty permissions array: AND 1 = 0", () => {
    expect(buildWikiSensitivitySqlFilter([])).toBe("AND 1 = 0");
  });

  it("unrelated permissions only: AND 1 = 0", () => {
    expect(
      buildWikiSensitivitySqlFilter([
        PERMISSIONS.FILES_WRITE,
        PERMISSIONS.NOTICE_READ,
      ]),
    ).toBe("AND 1 = 0");
  });

  it("all three read-path permissions: all 4 sensitivities allowed", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_REVIEW,
      PERMISSIONS.PROJECT_ACCESS_SECRET,
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY')",
    );
  });

  it("KNOWLEDGE_UPDATE alone grants no sensitivity access", () => {
    expect(buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_UPDATE])).toBe(
      "AND 1 = 0",
    );
  });
});
