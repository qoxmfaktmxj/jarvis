import { describe, it, expect } from "vitest";
import { canManageContractors, canAccessContractorData } from "../rbac.js";
import type { JarvisSession } from "../types.js";

const adminSession: JarvisSession = {
  userId: "admin-id",
  workspaceId: "ws",
  roles: ["ADMIN"],
  permissions: ["contractor:read", "contractor:admin"]
} as JarvisSession;

const userSession: JarvisSession = {
  userId: "user-id",
  workspaceId: "ws",
  roles: ["DEVELOPER"],
  permissions: ["contractor:read"]
} as JarvisSession;

describe("canManageContractors", () => {
  it("returns true for CONTRACTOR_ADMIN", () => {
    expect(canManageContractors(adminSession)).toBe(true);
  });
  it("returns false for CONTRACTOR_READ only", () => {
    expect(canManageContractors(userSession)).toBe(false);
  });
});

describe("canAccessContractorData", () => {
  it("allows admin to access anyone's data", () => {
    expect(canAccessContractorData(adminSession, "other-user-id")).toBe(true);
  });
  it("allows user to access own data", () => {
    expect(canAccessContractorData(userSession, "user-id")).toBe(true);
  });
  it("rejects user accessing others' data", () => {
    expect(canAccessContractorData(userSession, "other-user-id")).toBe(false);
  });
});
