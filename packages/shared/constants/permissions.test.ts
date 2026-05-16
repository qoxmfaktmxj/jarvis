/**
 * Sanity tests for RBAC simplification (2026-05-16): 23 permissions × 4 roles.
 */
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } from "./permissions.js";

describe("PERMISSIONS const (23 permissions)", () => {
  it("has exactly 23 entries", () => {
    expect(Object.keys(PERMISSIONS).length).toBe(23);
  });

  it("uses {resource}:{action} format with colon", () => {
    for (const value of Object.values(PERMISSIONS)) {
      expect(value).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });

  it("includes ADMIN_ALL master permission", () => {
    expect(PERMISSIONS.ADMIN_ALL).toBe("admin:all");
  });

  it("includes core domain read/admin pairs", () => {
    expect(PERMISSIONS.KNOWLEDGE_READ).toBe("knowledge:read");
    expect(PERMISSIONS.KNOWLEDGE_ADMIN).toBe("knowledge:admin");
    expect(PERMISSIONS.PROJECT_READ).toBe("project:read");
    expect(PERMISSIONS.PROJECT_ADMIN).toBe("project:admin");
    expect(PERMISSIONS.SCHEDULE_READ).toBe("schedule:read");
    expect(PERMISSIONS.SCHEDULE_ADMIN).toBe("schedule:admin");
  });
});

describe("ROLE_PERMISSIONS (4 roles)", () => {
  it("defines exactly 4 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([
      "ADMIN",
      "MANAGER",
      "MEMBER",
      "YEAREND"
    ]);
  });

  it("ADMIN holds all 23 permissions", () => {
    expect(ROLE_PERMISSIONS.ADMIN.length).toBe(23);
  });

  it("MANAGER holds 21 permissions (no user:admin, no admin:all)", () => {
    expect(ROLE_PERMISSIONS.MANAGER.length).toBe(21);
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain(PERMISSIONS.USER_ADMIN);
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain(PERMISSIONS.ADMIN_ALL);
  });

  it("MEMBER holds 10 permissions (reads + schedule:admin)", () => {
    expect(ROLE_PERMISSIONS.MEMBER.length).toBe(10);
    expect(ROLE_PERMISSIONS.MEMBER).toContain(PERMISSIONS.SCHEDULE_ADMIN);
    expect(ROLE_PERMISSIONS.MEMBER).not.toContain(PERMISSIONS.KNOWLEDGE_ADMIN);
  });

  it("YEAREND holds 0 jarvis permissions", () => {
    expect(ROLE_PERMISSIONS.YEAREND.length).toBe(0);
  });
});

describe("ROLE_LABELS (Korean UI labels)", () => {
  it("maps each role to a Korean label", () => {
    expect(ROLE_LABELS.ADMIN).toBe("관리자");
    expect(ROLE_LABELS.MANAGER).toBe("매니저");
    expect(ROLE_LABELS.MEMBER).toBe("일반");
    expect(ROLE_LABELS.YEAREND).toBe("연말정산");
  });
});
