import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions.js";

describe("permissions.ts graph additions", () => {
  it("exposes graph:read and graph:build constants", () => {
    expect(PERMISSIONS.GRAPH_READ).toBe("graph:read");
    expect(PERMISSIONS.GRAPH_BUILD).toBe("graph:build");
  });

  it("grants graph:read and graph:build to ADMIN, MANAGER, DEVELOPER", () => {
    for (const role of ["ADMIN", "MANAGER", "DEVELOPER"] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.GRAPH_READ);
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.GRAPH_BUILD);
    }
  });

  it("grants graph:read to VIEWER but NOT graph:build", () => {
    expect(ROLE_PERMISSIONS.VIEWER).toContain(PERMISSIONS.GRAPH_READ);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.GRAPH_BUILD);
  });

  it("does NOT grant graph permissions to HR by default", () => {
    expect(ROLE_PERMISSIONS.HR).not.toContain(PERMISSIONS.GRAPH_READ);
    expect(ROLE_PERMISSIONS.HR).not.toContain(PERMISSIONS.GRAPH_BUILD);
  });
});
