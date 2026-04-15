import { describe, expect, it } from "vitest";
import {
  buildGraphSnapshotSensitivitySqlFragment,
  buildWikiSensitivitySqlFilter
} from "../rbac.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

/**
 * X3 — WIKI_* 권한 조합 규칙 검증.
 *
 * buildWikiSensitivitySqlFilter 의 엄격 규약을 권한 단위로 확인한다:
 *   - PUBLIC, INTERNAL    → KNOWLEDGE_READ 필요
 *   - RESTRICTED          → KNOWLEDGE_REVIEW 필요 (KNOWLEDGE_UPDATE 단독으로는 불가)
 *   - SECRET_REF_ONLY     → SYSTEM_ACCESS_SECRET 필요
 *   - ADMIN_ALL           → 전체 허용 (bypass)
 */

/** IN 리스트에서 주어진 sensitivity 가 허용되는지 본다. */
function includesSensitivity(
  fragment: string,
  sensitivity: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY"
): boolean {
  if (fragment === "") {
    return true; // admin full allow
  }
  if (fragment === "AND 1 = 0") {
    return false;
  }
  const match = fragment.match(/IN \(([^)]+)\)/);
  if (!match) {
    return false;
  }
  return match[1].includes(`'${sensitivity}'`);
}

describe("RBAC WIKI_* permission rules", () => {
  describe("KNOWLEDGE_REVIEW alone (no KNOWLEDGE_READ)", () => {
    // READ 없이 REVIEW 만 있을 때는 RESTRICTED 만 허용해야 한다.
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_REVIEW]);

    it("allows RESTRICTED", () => {
      expect(includesSensitivity(frag, "RESTRICTED")).toBe(true);
    });

    it("does NOT allow PUBLIC (no READ)", () => {
      expect(includesSensitivity(frag, "PUBLIC")).toBe(false);
    });

    it("does NOT allow INTERNAL (no READ)", () => {
      expect(includesSensitivity(frag, "INTERNAL")).toBe(false);
    });

    it("does NOT allow SECRET_REF_ONLY (no SYSTEM_ACCESS_SECRET)", () => {
      expect(includesSensitivity(frag, "SECRET_REF_ONLY")).toBe(false);
    });

    it("fragment is exactly AND sensitivity IN ('RESTRICTED')", () => {
      expect(frag).toBe("AND sensitivity IN ('RESTRICTED')");
    });
  });

  describe("KNOWLEDGE_UPDATE alone (no READ/REVIEW/SECRET)", () => {
    // UPDATE 는 sensitivity 매트릭스에 영향 없음. 엄격 규약상 어떤 sensitivity 도 못 본다.
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_UPDATE]);

    it("returns AND 1 = 0 (UPDATE alone grants no sensitivity access)", () => {
      expect(frag).toBe("AND 1 = 0");
    });

    it("does NOT allow RESTRICTED (UPDATE is not a read path)", () => {
      expect(includesSensitivity(frag, "RESTRICTED")).toBe(false);
    });
  });

  describe("KNOWLEDGE_READ + KNOWLEDGE_UPDATE (no REVIEW, no SECRET)", () => {
    // DEVELOPER 의 일부 서브셋. READ 가 있으니 PUBLIC/INTERNAL 은 허용, RESTRICTED 는 불허.
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_UPDATE
    ]);

    it("allows PUBLIC", () => {
      expect(includesSensitivity(frag, "PUBLIC")).toBe(true);
    });

    it("allows INTERNAL", () => {
      expect(includesSensitivity(frag, "INTERNAL")).toBe(true);
    });

    it("does NOT allow RESTRICTED (UPDATE does not grant RESTRICTED — REVIEW needed)", () => {
      expect(includesSensitivity(frag, "RESTRICTED")).toBe(false);
    });

    it("does NOT allow SECRET_REF_ONLY (SYSTEM_ACCESS_SECRET needed)", () => {
      expect(includesSensitivity(frag, "SECRET_REF_ONLY")).toBe(false);
    });
  });

  describe("ADMIN_ALL bypass", () => {
    it("ADMIN_ALL alone returns empty fragment (full allow)", () => {
      expect(buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL])).toBe("");
    });

    it("ADMIN_ALL + no other permissions still allows every sensitivity", () => {
      const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL]);
      expect(includesSensitivity(frag, "PUBLIC")).toBe(true);
      expect(includesSensitivity(frag, "INTERNAL")).toBe(true);
      expect(includesSensitivity(frag, "RESTRICTED")).toBe(true);
      expect(includesSensitivity(frag, "SECRET_REF_ONLY")).toBe(true);
    });

    it("ADMIN_ALL mixed with unrelated permissions still bypasses", () => {
      const frag = buildWikiSensitivitySqlFilter([
        PERMISSIONS.ADMIN_ALL,
        PERMISSIONS.PROJECT_READ
      ]);
      expect(frag).toBe("");
    });
  });

  describe("SYSTEM_ACCESS_SECRET + KNOWLEDGE_READ (no REVIEW)", () => {
    // DEVELOPER 역할의 핵심 조합. PUBLIC/INTERNAL/SECRET_REF_ONLY 허용, RESTRICTED 제외.
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.SYSTEM_ACCESS_SECRET
    ]);

    it("allows PUBLIC", () => {
      expect(includesSensitivity(frag, "PUBLIC")).toBe(true);
    });

    it("allows INTERNAL", () => {
      expect(includesSensitivity(frag, "INTERNAL")).toBe(true);
    });

    it("allows SECRET_REF_ONLY", () => {
      expect(includesSensitivity(frag, "SECRET_REF_ONLY")).toBe(true);
    });

    it("does NOT allow RESTRICTED (REVIEW not present)", () => {
      expect(includesSensitivity(frag, "RESTRICTED")).toBe(false);
    });

    it("fragment exact shape", () => {
      expect(frag).toBe(
        "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')"
      );
    });
  });
});

describe("wiki vs graph sensitivity filters — separation of concerns", () => {
  // wiki 는 4-tier (PUBLIC/INTERNAL/RESTRICTED/SECRET_REF_ONLY 를 분리 권한으로 gate)
  // graph 는 3-tier 성격 (admin-only 또는 GRAPH_READ 로 PUBLIC/INTERNAL 만).
  // 동일한 ADMIN_ALL 입력에 대해서는 두 함수 모두 빈 문자열을 반환해야 한다.

  it("ADMIN_ALL: both filters return empty string", () => {
    expect(buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL])).toBe("");
    expect(
      buildGraphSnapshotSensitivitySqlFragment([PERMISSIONS.ADMIN_ALL])
    ).toBe("");
  });

  it("empty permissions: both filters return AND 1 = 0", () => {
    expect(buildWikiSensitivitySqlFilter([])).toBe("AND 1 = 0");
    expect(buildGraphSnapshotSensitivitySqlFragment([])).toBe("AND 1 = 0");
  });

  it("KNOWLEDGE_READ alone: wiki allows PUBLIC/INTERNAL, graph blocks (needs GRAPH_READ)", () => {
    const wiki = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ]);
    const graph = buildGraphSnapshotSensitivitySqlFragment([
      PERMISSIONS.KNOWLEDGE_READ
    ]);
    expect(wiki).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
    expect(graph).toBe("AND 1 = 0");
  });

  it("GRAPH_READ alone: graph allows PUBLIC/INTERNAL, wiki blocks (needs KNOWLEDGE_READ)", () => {
    const wiki = buildWikiSensitivitySqlFilter([PERMISSIONS.GRAPH_READ]);
    const graph = buildGraphSnapshotSensitivitySqlFragment([
      PERMISSIONS.GRAPH_READ
    ]);
    expect(wiki).toBe("AND 1 = 0");
    expect(graph).toContain("sensitivity NOT IN");
    expect(graph).toContain("RESTRICTED");
    expect(graph).toContain("SECRET_REF_ONLY");
  });

  it("wiki is 4-tier (RESTRICTED and SECRET_REF_ONLY are separately gated)", () => {
    // REVIEW 단독 → RESTRICTED 만 허용
    expect(
      buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_REVIEW])
    ).toBe("AND sensitivity IN ('RESTRICTED')");
    // SYSTEM_ACCESS_SECRET 단독 → SECRET_REF_ONLY 만 허용
    expect(
      buildWikiSensitivitySqlFilter([PERMISSIONS.SYSTEM_ACCESS_SECRET])
    ).toBe("AND sensitivity IN ('SECRET_REF_ONLY')");
  });

  it("graph is 2-tier (RESTRICTED/SECRET_REF_ONLY both admin-only in P0)", () => {
    // GRAPH_READ 는 RESTRICTED / SECRET_REF_ONLY 를 둘 다 배제한다 (같은 NOT IN).
    const graph = buildGraphSnapshotSensitivitySqlFragment([
      PERMISSIONS.GRAPH_READ
    ]);
    expect(graph).toBe(
      "AND sensitivity NOT IN ('RESTRICTED', 'SECRET_REF_ONLY')"
    );
  });
});
