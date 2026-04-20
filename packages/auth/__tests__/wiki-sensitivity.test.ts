import { describe, expect, it } from "vitest";
import { buildWikiSensitivitySqlFilter } from "../rbac.js";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS
} from "@jarvis/shared/constants/permissions";

/**
 * X3 — buildWikiSensitivitySqlFilter 4×4 매트릭스 단위 테스트.
 *
 * 매트릭스 (sensitivity 4값 × 역할 4종):
 *
 * |               | PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY |
 * |---------------|--------|----------|------------|-----------------|
 * | ADMIN         |   O    |    O     |     O      |       O         |
 * | MANAGER       |   O    |    O     |     O      |       X         |
 * | DEVELOPER     |   O    |    O     |     X      |       O         |
 * | VIEWER        |   O    |    O     |     X      |       X         |
 *
 * ROLE_PERMISSIONS (packages/shared/constants/permissions.ts) 기준:
 *   - ADMIN:     ADMIN_ALL (+전체)
 *   - MANAGER:   KNOWLEDGE_READ + KNOWLEDGE_UPDATE + KNOWLEDGE_REVIEW (SYSTEM_ACCESS_SECRET 없음)
 *   - DEVELOPER: KNOWLEDGE_READ + KNOWLEDGE_UPDATE + SYSTEM_ACCESS_SECRET (KNOWLEDGE_REVIEW 없음)
 *   - VIEWER:    KNOWLEDGE_READ 만
 */

type Sensitivity = "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";

/**
 * buildWikiSensitivitySqlFilter 가 생성한 fragment 가 주어진 sensitivity 를
 * 통과시키는지 판정한다. 빈 문자열("")은 admin 전체 통과, "AND 1 = 0"은 차단.
 * 그 외에는 `IN ('A', 'B', ...)` 리스트에 sensitivity 가 포함되는지 본다.
 */
function fragmentAllows(fragment: string, sensitivity: Sensitivity): boolean {
  if (fragment === "") {
    return true;
  }
  if (fragment === "AND 1 = 0") {
    return false;
  }
  // Fragment shape: `AND <col> IN ('PUBLIC', 'INTERNAL', ...)`
  const match = fragment.match(/IN \(([^)]+)\)/);
  if (!match?.[1]) {
    return false;
  }
  return (match[1] ?? "").includes(`'${sensitivity}'`);
}

const SENSITIVITIES: Sensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY"
];

const ROLE_EXPECTED: Record<string, Record<Sensitivity, boolean>> = {
  ADMIN: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: true,
    SECRET_REF_ONLY: true
  },
  MANAGER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: true,
    SECRET_REF_ONLY: false
  },
  DEVELOPER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: false,
    SECRET_REF_ONLY: true
  },
  VIEWER: {
    PUBLIC: true,
    INTERNAL: true,
    RESTRICTED: false,
    SECRET_REF_ONLY: false
  }
};

describe("buildWikiSensitivitySqlFilter — 4x4 role × sensitivity matrix", () => {
  for (const role of Object.keys(ROLE_EXPECTED)) {
    describe(`role=${role}`, () => {
      const permissions = ROLE_PERMISSIONS[role] as string[];
      const fragment = buildWikiSensitivitySqlFilter(permissions);

      for (const sensitivity of SENSITIVITIES) {
        const expected = ROLE_EXPECTED[role]![sensitivity];
        it(`${expected ? "allows" : "blocks"} ${sensitivity}`, () => {
          expect(fragmentAllows(fragment, sensitivity)).toBe(expected);
        });
      }
    });
  }
});

describe("buildWikiSensitivitySqlFilter — fragment shape per role", () => {
  it("ADMIN: empty string (no filter)", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.ADMIN as string[]
    );
    expect(frag).toBe("");
  });

  it("MANAGER: PUBLIC, INTERNAL, RESTRICTED (no SECRET_REF_ONLY)", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.MANAGER as string[]
    );
    expect(frag).toContain("PUBLIC");
    expect(frag).toContain("INTERNAL");
    expect(frag).toContain("RESTRICTED");
    expect(frag).not.toContain("SECRET_REF_ONLY");
  });

  it("DEVELOPER: PUBLIC, INTERNAL, SECRET_REF_ONLY (no RESTRICTED)", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.DEVELOPER as string[]
    );
    expect(frag).toContain("PUBLIC");
    expect(frag).toContain("INTERNAL");
    expect(frag).toContain("SECRET_REF_ONLY");
    expect(frag).not.toContain("RESTRICTED");
  });

  it("VIEWER: PUBLIC, INTERNAL only", () => {
    const frag = buildWikiSensitivitySqlFilter(
      ROLE_PERMISSIONS.VIEWER as string[]
    );
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
  });
});

describe("buildWikiSensitivitySqlFilter — permission level single-cases", () => {
  it("ADMIN_ALL alone: empty string", () => {
    expect(buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL])).toBe("");
  });

  it("KNOWLEDGE_READ alone: PUBLIC + INTERNAL", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ]);
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
  });

  it("KNOWLEDGE_REVIEW alone (no READ): AND 1 = 0 (KNOWLEDGE_READ required as gate)", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_REVIEW]);
    expect(frag).toBe("AND 1 = 0");
  });

  it("SYSTEM_ACCESS_SECRET alone (no READ): AND 1 = 0 (KNOWLEDGE_READ required as gate)", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.SYSTEM_ACCESS_SECRET
    ]);
    expect(frag).toBe("AND 1 = 0");
  });

  it("READ + REVIEW: PUBLIC, INTERNAL, RESTRICTED", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_REVIEW
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')"
    );
  });

  it("READ + SYSTEM_ACCESS_SECRET: PUBLIC, INTERNAL, SECRET_REF_ONLY", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.SYSTEM_ACCESS_SECRET
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')"
    );
  });

  it("READ + REVIEW + SYSTEM_ACCESS_SECRET: all four", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_REVIEW,
      PERMISSIONS.SYSTEM_ACCESS_SECRET
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY')"
    );
  });

  it("empty permissions: AND 1 = 0", () => {
    expect(buildWikiSensitivitySqlFilter([])).toBe("AND 1 = 0");
  });

  it("unrelated permissions only (NOTICE_READ, ATTENDANCE_READ): AND 1 = 0", () => {
    expect(
      buildWikiSensitivitySqlFilter([
        PERMISSIONS.NOTICE_READ,
        PERMISSIONS.ATTENDANCE_READ
      ])
    ).toBe("AND 1 = 0");
  });

  it("duplicate permissions are handled gracefully", () => {
    // 동일 권한이 2번 들어와도 fragment shape 는 안정적이어야 한다.
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_READ
    ]);
    // 중복으로 allowed 리스트에 PUBLIC/INTERNAL 이 중복 포함될 수 있는지 본다.
    // 현재 구현상 중복이 들어가도 IN 절 자체는 유효한 SQL 이다.
    expect(frag).toContain("PUBLIC");
    expect(frag).toContain("INTERNAL");
    expect(frag.startsWith("AND sensitivity IN (")).toBe(true);
  });
});

describe("buildWikiSensitivitySqlFilter — options.column", () => {
  it("default column is 'sensitivity'", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ]);
    expect(frag).toContain("AND sensitivity IN");
  });

  it("custom column is propagated to fragment", () => {
    const frag = buildWikiSensitivitySqlFilter(
      [PERMISSIONS.KNOWLEDGE_READ],
      { column: "wpi.sensitivity" }
    );
    expect(frag).toBe("AND wpi.sensitivity IN ('PUBLIC', 'INTERNAL')");
  });

  it("custom column does not affect admin empty-string bypass", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL], {
      column: "wpi.sensitivity"
    });
    expect(frag).toBe("");
  });

  it("custom column does not affect 'AND 1 = 0' no-permission case", () => {
    const frag = buildWikiSensitivitySqlFilter([], {
      column: "wpi.sensitivity"
    });
    expect(frag).toBe("AND 1 = 0");
  });

  it("custom column with full permissions shows up in IN clause alias", () => {
    const frag = buildWikiSensitivitySqlFilter(
      [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.KNOWLEDGE_REVIEW,
        PERMISSIONS.SYSTEM_ACCESS_SECRET
      ],
      { column: "wpi.sensitivity" }
    );
    expect(frag).toBe(
      "AND wpi.sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY')"
    );
  });
});
