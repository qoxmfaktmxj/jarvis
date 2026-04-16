import { describe, expect, it } from "vitest";
import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "@jarvis/shared/constants/permissions";
import { canViewSensitivity } from "@/lib/server/wiki-sensitivity";

/**
 * T8 -- canViewSensitivity 5 roles x 4 sensitivities + SSR guard integration.
 *
 * canViewSensitivity (apps/web/lib/server/wiki-sensitivity.ts) 의 20 케이스
 * (5 roles x 4 sensitivities) + unknown sensitivity + no KNOWLEDGE_READ 세션,
 * 그리고 page.tsx SSR 가드 흐름을 함수로 추출해 통합 검증한다.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Sensitivity = "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";

const SENSITIVITIES: Sensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY",
];

const ROLES = ["ADMIN", "MANAGER", "DEVELOPER", "HR", "VIEWER"] as const;

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
    ssoSubject: "sub-test",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600_000,
    ...overrides,
  } as JarvisSession;
}

// ---------------------------------------------------------------------------
// 1. canViewSensitivity -- 5 roles x 4 sensitivities (20 cases)
// ---------------------------------------------------------------------------

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
 *
 * Note: ADMIN has ADMIN_ALL which includes every permission (including
 * KNOWLEDGE_READ, KNOWLEDGE_REVIEW, SYSTEM_ACCESS_SECRET). canViewSensitivity
 * checks KNOWLEDGE_READ first, then specific per-sensitivity permissions.
 * ADMIN_ALL means all permissions are present.
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

describe("canViewSensitivity -- 5 roles x 4 sensitivities", () => {
  describe.each(
    ROLES.map((role) => ({ role })),
  )("role: $role", ({ role }) => {
    const session = makeSession(role);

    it.each(SENSITIVITIES)("sensitivity %s", (sensitivity) => {
      const expected = EXPECTED_MATRIX[role][sensitivity];
      expect(canViewSensitivity(session, sensitivity)).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. canViewSensitivity -- edge cases
// ---------------------------------------------------------------------------

describe("canViewSensitivity -- edge cases", () => {
  it("unknown sensitivity -> false (conservative block)", () => {
    const session = makeSession("ADMIN");
    expect(canViewSensitivity(session, "UNKNOWN_VALUE")).toBe(false);
  });

  it("empty string sensitivity -> false (conservative block)", () => {
    const session = makeSession("ADMIN");
    expect(canViewSensitivity(session, "")).toBe(false);
  });

  it("session without KNOWLEDGE_READ -> false for all sensitivities", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ATTENDANCE_READ],
    });
    for (const sensitivity of SENSITIVITIES) {
      expect(canViewSensitivity(session, sensitivity)).toBe(false);
    }
  });

  it("KNOWLEDGE_READ alone is sufficient for PUBLIC", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.KNOWLEDGE_READ],
    });
    expect(canViewSensitivity(session, "PUBLIC")).toBe(true);
  });

  it("KNOWLEDGE_READ alone is sufficient for INTERNAL", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.KNOWLEDGE_READ],
    });
    expect(canViewSensitivity(session, "INTERNAL")).toBe(true);
  });

  it("KNOWLEDGE_READ alone is NOT sufficient for RESTRICTED", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.KNOWLEDGE_READ],
    });
    expect(canViewSensitivity(session, "RESTRICTED")).toBe(false);
  });

  it("KNOWLEDGE_READ alone is NOT sufficient for SECRET_REF_ONLY", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.KNOWLEDGE_READ],
    });
    expect(canViewSensitivity(session, "SECRET_REF_ONLY")).toBe(false);
  });

  it("KNOWLEDGE_REVIEW without KNOWLEDGE_READ -> false (base access required)", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.KNOWLEDGE_REVIEW],
    });
    expect(canViewSensitivity(session, "RESTRICTED")).toBe(false);
  });

  it("SYSTEM_ACCESS_SECRET without KNOWLEDGE_READ -> false (base access required)", () => {
    const session = makeSession("VIEWER", {
      permissions: [PERMISSIONS.SYSTEM_ACCESS_SECRET],
    });
    expect(canViewSensitivity(session, "SECRET_REF_ONLY")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. SSR guard integration -- evalPageAccess
// ---------------------------------------------------------------------------

/**
 * page.tsx SSR guard flow:
 *   1. session.workspaceId !== workspaceId -> forbidden
 *   2. !canViewSensitivity(session, sensitivity) -> forbidden
 *   3. requiredPermission && !ADMIN_ALL && !hasPermission(session, requiredPermission) -> forbidden
 *   4. pass -> ok
 *
 * Since page.tsx uses Next.js forbidden()/notFound() which cannot be unit-tested
 * easily, we extract the guard logic into a pure function and test that.
 */
function evalPageAccess(
  session: JarvisSession,
  params: {
    workspaceId: string;
    sensitivity: string;
    requiredPermission?: string | null;
    pageExists: boolean;
  },
): "ok" | "notfound" | "forbidden" {
  // Guard 1: workspace mismatch
  if (session.workspaceId !== params.workspaceId) {
    return "forbidden";
  }

  // Guard 2: page not found
  if (!params.pageExists) {
    return "notfound";
  }

  // Guard 3: sensitivity check
  if (!canViewSensitivity(session, params.sensitivity)) {
    return "forbidden";
  }

  // Guard 4: requiredPermission (frontmatter)
  if (
    params.requiredPermission &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL) &&
    !hasPermission(session, params.requiredPermission)
  ) {
    return "forbidden";
  }

  return "ok";
}

describe("SSR guard integration -- evalPageAccess", () => {
  const DEFAULT_PARAMS = {
    workspaceId: "ws1",
    sensitivity: "PUBLIC" as string,
    pageExists: true,
  };

  describe("workspace mismatch -> forbidden", () => {
    it.each(ROLES)("role %s with wrong workspace", (role) => {
      const session = makeSession(role);
      expect(
        evalPageAccess(session, { ...DEFAULT_PARAMS, workspaceId: "ws-other" }),
      ).toBe("forbidden");
    });
  });

  describe("page not found -> notfound", () => {
    it.each(ROLES)("role %s with missing page", (role) => {
      const session = makeSession(role);
      expect(
        evalPageAccess(session, { ...DEFAULT_PARAMS, pageExists: false }),
      ).toBe("notfound");
    });
  });

  describe("sensitivity gate", () => {
    it("ADMIN can access SECRET_REF_ONLY page", () => {
      const session = makeSession("ADMIN");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "SECRET_REF_ONLY",
        }),
      ).toBe("ok");
    });

    it("VIEWER cannot access RESTRICTED page", () => {
      const session = makeSession("VIEWER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "RESTRICTED",
        }),
      ).toBe("forbidden");
    });

    it("DEVELOPER cannot access RESTRICTED page", () => {
      const session = makeSession("DEVELOPER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "RESTRICTED",
        }),
      ).toBe("forbidden");
    });

    it("MANAGER can access RESTRICTED page", () => {
      const session = makeSession("MANAGER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "RESTRICTED",
        }),
      ).toBe("ok");
    });

    it("DEVELOPER can access SECRET_REF_ONLY page", () => {
      const session = makeSession("DEVELOPER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "SECRET_REF_ONLY",
        }),
      ).toBe("ok");
    });

    it("MANAGER cannot access SECRET_REF_ONLY page", () => {
      const session = makeSession("MANAGER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "SECRET_REF_ONLY",
        }),
      ).toBe("forbidden");
    });

    it("unknown sensitivity -> forbidden for all roles", () => {
      for (const role of ROLES) {
        const session = makeSession(role);
        expect(
          evalPageAccess(session, {
            ...DEFAULT_PARAMS,
            sensitivity: "BOGUS_VALUE",
          }),
        ).toBe("forbidden");
      }
    });
  });

  describe("requiredPermission gate (frontmatter)", () => {
    it("ADMIN bypasses requiredPermission check", () => {
      const session = makeSession("ADMIN");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          requiredPermission: PERMISSIONS.SYSTEM_ACCESS_SECRET,
        }),
      ).toBe("ok");
    });

    it("DEVELOPER with matching requiredPermission passes", () => {
      const session = makeSession("DEVELOPER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          requiredPermission: PERMISSIONS.SYSTEM_ACCESS_SECRET,
        }),
      ).toBe("ok");
    });

    it("VIEWER without matching requiredPermission is forbidden", () => {
      const session = makeSession("VIEWER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          requiredPermission: PERMISSIONS.SYSTEM_ACCESS_SECRET,
        }),
      ).toBe("forbidden");
    });

    it("null requiredPermission -> no additional gate", () => {
      const session = makeSession("VIEWER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          requiredPermission: null,
        }),
      ).toBe("ok");
    });

    it("undefined requiredPermission -> no additional gate", () => {
      const session = makeSession("VIEWER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          requiredPermission: undefined,
        }),
      ).toBe("ok");
    });
  });

  describe("combined: sensitivity + requiredPermission", () => {
    it("DEVELOPER on RESTRICTED page with requiredPermission -> forbidden (sensitivity blocks first)", () => {
      const session = makeSession("DEVELOPER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "RESTRICTED",
          requiredPermission: PERMISSIONS.KNOWLEDGE_UPDATE,
        }),
      ).toBe("forbidden");
    });

    it("MANAGER on RESTRICTED page with KNOWLEDGE_REVIEW requiredPermission -> ok", () => {
      const session = makeSession("MANAGER");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "RESTRICTED",
          requiredPermission: PERMISSIONS.KNOWLEDGE_REVIEW,
        }),
      ).toBe("ok");
    });

    it("HR on INTERNAL page with no requiredPermission -> ok", () => {
      const session = makeSession("HR");
      expect(
        evalPageAccess(session, {
          ...DEFAULT_PARAMS,
          sensitivity: "INTERNAL",
        }),
      ).toBe("ok");
    });
  });
});
