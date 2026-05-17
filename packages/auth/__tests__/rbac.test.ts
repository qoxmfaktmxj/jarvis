// packages/auth/__tests__/rbac.test.ts
import { describe, expect, it } from "vitest";
import { hasPermission, hasAnyPermission } from "../rbac.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "../types.js";

function makeSession(permissions: string[]): JarvisSession {
  return {
    id: "sid",
    userId: "uid",
    workspaceId: "wsid",
    employeeId: "EMP",
    name: "U",
    roles: [],
    permissions,
    createdAt: 0,
    expiresAt: 0,
  };
}

describe("hasPermission", () => {
  it("returns true when session has the exact permission", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasPermission(s, PERMISSIONS.KNOWLEDGE_READ)).toBe(true);
  });

  it("returns false when session lacks the permission", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasPermission(s, PERMISSIONS.SALES_ADMIN)).toBe(false);
  });

  it("returns true for ANY permission when session holds ADMIN_ALL (bypass)", () => {
    const s = makeSession([PERMISSIONS.ADMIN_ALL]);
    expect(hasPermission(s, PERMISSIONS.KNOWLEDGE_ADMIN)).toBe(true);
    expect(hasPermission(s, PERMISSIONS.SALES_ADMIN)).toBe(true);
    expect(hasPermission(s, "files:write")).toBe(true); // 폐기된 stale permission도 통과
  });
});

describe("hasAnyPermission", () => {
  it("returns true when session has at least one of the listed permissions", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_ADMIN]);
    expect(
      hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN, PERMISSIONS.KNOWLEDGE_ADMIN]),
    ).toBe(true);
  });

  it("returns false when session has none of the listed permissions", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(
      hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN, PERMISSIONS.KNOWLEDGE_ADMIN]),
    ).toBe(false);
  });

  it("returns true for any list when session holds ADMIN_ALL (bypass)", () => {
    const s = makeSession([PERMISSIONS.ADMIN_ALL]);
    expect(hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN])).toBe(true);
    expect(hasAnyPermission(s, [])).toBe(true);
  });

  it("returns false for empty list when session has no ADMIN_ALL", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasAnyPermission(s, [])).toBe(false);
  });
});
