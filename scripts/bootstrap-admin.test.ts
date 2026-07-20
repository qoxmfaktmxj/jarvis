import { describe, expect, it } from "vitest";
import { validateBootstrapPassword } from "./bootstrap-password.js";

describe("validateBootstrapPassword", () => {
  it("accepts a strong password", () => {
    expect(() => validateBootstrapPassword("jarvispublic2026")).not.toThrow();
  });

  it("rejects shared default-style passwords", () => {
    expect(() => validateBootstrapPassword("admin1234")).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
  });
});
