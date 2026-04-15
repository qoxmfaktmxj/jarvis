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

describe("permissions.ts notice additions", () => {
  it("exposes notice:* constants", () => {
    expect(PERMISSIONS.NOTICE_READ).toBe("notice:read");
    expect(PERMISSIONS.NOTICE_CREATE).toBe("notice:create");
    expect(PERMISSIONS.NOTICE_UPDATE).toBe("notice:update");
    expect(PERMISSIONS.NOTICE_DELETE).toBe("notice:delete");
  });

  it("grants ADMIN every notice permission (full set)", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.NOTICE_READ);
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.NOTICE_CREATE);
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.NOTICE_UPDATE);
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.NOTICE_DELETE);
  });

  it("grants MANAGER read/create/update but NOT delete", () => {
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.NOTICE_READ);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.NOTICE_CREATE);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.NOTICE_UPDATE);
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain(PERMISSIONS.NOTICE_DELETE);
  });

  it("grants HR read/create/update but NOT delete", () => {
    expect(ROLE_PERMISSIONS.HR).toContain(PERMISSIONS.NOTICE_READ);
    expect(ROLE_PERMISSIONS.HR).toContain(PERMISSIONS.NOTICE_CREATE);
    expect(ROLE_PERMISSIONS.HR).toContain(PERMISSIONS.NOTICE_UPDATE);
    expect(ROLE_PERMISSIONS.HR).not.toContain(PERMISSIONS.NOTICE_DELETE);
  });

  it("grants DEVELOPER only notice:read", () => {
    expect(ROLE_PERMISSIONS.DEVELOPER).toContain(PERMISSIONS.NOTICE_READ);
    expect(ROLE_PERMISSIONS.DEVELOPER).not.toContain(PERMISSIONS.NOTICE_CREATE);
    expect(ROLE_PERMISSIONS.DEVELOPER).not.toContain(PERMISSIONS.NOTICE_UPDATE);
    expect(ROLE_PERMISSIONS.DEVELOPER).not.toContain(PERMISSIONS.NOTICE_DELETE);
  });

  it("grants VIEWER only notice:read", () => {
    expect(ROLE_PERMISSIONS.VIEWER).toContain(PERMISSIONS.NOTICE_READ);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.NOTICE_CREATE);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.NOTICE_UPDATE);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.NOTICE_DELETE);
  });
});
