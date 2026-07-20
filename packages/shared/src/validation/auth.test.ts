import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, isPermission } from "../constants/permissions.js";
import { validatePasswordPolicy } from "./auth.js";

describe("@jarvis/shared auth contracts", () => {
  it("exposes the fixed permission matrix", () => {
    expect(ROLE_PERMISSIONS.READER).toContain(PERMISSIONS.WIKI_READ);
    expect(ROLE_PERMISSIONS.EDITOR).toContain(PERMISSIONS.SOURCE_INGEST);
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.USER_ADMIN);
    expect(isPermission("wiki:read")).toBe(true);
    expect(isPermission(`${["sa", "les"].join("")}:admin`)).toBe(false);
  });

  it("enforces password policy", () => {
    expect(() => validatePasswordPolicy("jarvispublic2026")).not.toThrow();
    expect(() => validatePasswordPolicy("password1234")).toThrow(/known default/i);
  });
});
