import { describe, expect, it } from "vitest";
import {
  canAccessGraphSnapshotSensitivity,
  buildGraphSnapshotSensitivitySqlFragment,
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
