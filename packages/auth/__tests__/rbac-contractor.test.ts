import { describe, it, expect } from "vitest";
import { canManageContractors, canAccessContractorData } from "../rbac.js";
import type { JarvisSession } from "../types.js";

const adminSession: JarvisSession = {
  userId: "admin-id",
  workspaceId: "ws",
  roles: ["ADMIN"],
  permissions: ["user:read", "user:admin"]
} as JarvisSession;

const memberSession: JarvisSession = {
  userId: "user-id",
  workspaceId: "ws",
  roles: ["MEMBER"],
  permissions: ["user:read"]
} as JarvisSession;

describe("canManageContractors", () => {
  it("returns true for USER_ADMIN", () => {
    expect(canManageContractors(adminSession)).toBe(true);
  });
  it("returns false for USER_READ only", () => {
    expect(canManageContractors(memberSession)).toBe(false);
  });
});

describe("canAccessContractorData", () => {
  it("allows admin to access anyone's data", () => {
    expect(canAccessContractorData(adminSession, "other-user-id")).toBe(true);
  });
  it("allows user to access own data", () => {
    expect(canAccessContractorData(memberSession, "user-id")).toBe(true);
  });
  it("rejects user accessing others' data", () => {
    expect(canAccessContractorData(memberSession, "other-user-id")).toBe(false);
  });
});
