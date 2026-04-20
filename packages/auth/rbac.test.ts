import { describe, expect, it } from "vitest";
import {
  canAccessGraphSnapshotSensitivity,
  buildGraphSnapshotSensitivitySqlFragment,
  buildWikiSensitivitySqlFilter,
} from "./rbac.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

describe("graph snapshot sensitivity", () => {
  describe("canAccessGraphSnapshotSensitivity", () => {
    it("allows PUBLIC for anyone with graph:read", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], "PUBLIC"),
      ).toBe(true);
    });

    it("allows INTERNAL for graph:read holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], "INTERNAL"),
      ).toBe(true);
    });

    it("rejects INTERNAL for users without graph:read", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.KNOWLEDGE_READ],
          "INTERNAL",
        ),
      ).toBe(false);
    });

    it("rejects RESTRICTED for plain graph:read holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.GRAPH_READ],
          "RESTRICTED",
        ),
      ).toBe(false);
    });

    it("allows RESTRICTED for admin:all holders", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.ADMIN_ALL],
          "RESTRICTED",
        ),
      ).toBe(true);
    });

    it("allows SECRET_REF_ONLY only for admin:all", () => {
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.GRAPH_READ],
          "SECRET_REF_ONLY",
        ),
      ).toBe(false);
      expect(
        canAccessGraphSnapshotSensitivity(
          [PERMISSIONS.ADMIN_ALL],
          "SECRET_REF_ONLY",
        ),
      ).toBe(true);
    });

    it("defaults null/undefined sensitivity to INTERNAL", () => {
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.GRAPH_READ], null),
      ).toBe(true);
      expect(
        canAccessGraphSnapshotSensitivity([PERMISSIONS.KNOWLEDGE_READ], null),
      ).toBe(false);
    });
  });

  describe("buildGraphSnapshotSensitivitySqlFragment", () => {
    it("returns empty string for admin (no filter)", () => {
      expect(
        buildGraphSnapshotSensitivitySqlFragment([PERMISSIONS.ADMIN_ALL]),
      ).toBe("");
    });

    it("returns PUBLIC/INTERNAL filter for graph:read holders", () => {
      const frag = buildGraphSnapshotSensitivitySqlFragment([
        PERMISSIONS.GRAPH_READ,
      ]);
      expect(frag).toContain("sensitivity NOT IN");
      expect(frag).toContain("RESTRICTED");
      expect(frag).toContain("SECRET_REF_ONLY");
    });

    it("returns no-results filter when caller lacks graph:read entirely", () => {
      expect(
        buildGraphSnapshotSensitivitySqlFragment([PERMISSIONS.KNOWLEDGE_READ]),
      ).toBe("AND 1 = 0");
    });
  });
});

describe("buildWikiSensitivitySqlFilter (Phase-W3 T5)", () => {
  it("READ only: sees PUBLIC and INTERNAL only", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ]);
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
  });

  it("READ + REVIEW: sees RESTRICTED too (but not SECRET_REF_ONLY)", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_REVIEW,
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED')",
    );
  });

  it("READ + PROJECT_ACCESS_SECRET: sees SECRET_REF_ONLY too (but not RESTRICTED)", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.PROJECT_ACCESS_SECRET,
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'SECRET_REF_ONLY')",
    );
  });

  it("READ + REVIEW + PROJECT_ACCESS_SECRET: sees everything via union", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_REVIEW,
      PERMISSIONS.PROJECT_ACCESS_SECRET,
    ]);
    expect(frag).toBe(
      "AND sensitivity IN ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY')",
    );
  });

  it("ADMIN_ALL: returns empty string (no filter)", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL]);
    expect(frag).toBe("");
  });

  it("no permissions: returns AND 1 = 0 (sees nothing)", () => {
    const frag = buildWikiSensitivitySqlFilter([]);
    expect(frag).toBe("AND 1 = 0");
  });

  it("unrelated permissions only: returns AND 1 = 0", () => {
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.NOTICE_READ,
      PERMISSIONS.FILES_WRITE,
    ]);
    expect(frag).toBe("AND 1 = 0");
  });

  it("strict contract: KNOWLEDGE_UPDATE alone is NOT sufficient for RESTRICTED", () => {
    // 엄격 규약: UPDATE 단독으로는 RESTRICTED 를 볼 수 없음. READ 는 있어야 PUBLIC/INTERNAL 통과.
    const frag = buildWikiSensitivitySqlFilter([
      PERMISSIONS.KNOWLEDGE_READ,
      PERMISSIONS.KNOWLEDGE_UPDATE,
    ]);
    expect(frag).toBe("AND sensitivity IN ('PUBLIC', 'INTERNAL')");
    expect(frag).not.toContain("RESTRICTED");
  });

  it("custom column option: rewrites fragment to target alias", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ], {
      column: "wpi.sensitivity",
    });
    expect(frag).toBe("AND wpi.sensitivity IN ('PUBLIC', 'INTERNAL')");
  });

  it("custom column option: admin returns empty regardless of column", () => {
    const frag = buildWikiSensitivitySqlFilter([PERMISSIONS.ADMIN_ALL], {
      column: "wpi.sensitivity",
    });
    expect(frag).toBe("");
  });
});
