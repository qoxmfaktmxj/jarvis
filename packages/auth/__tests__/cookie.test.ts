import { describe, expect, test } from "vitest";
import { validateCookieDomain } from "../cookie.js";

describe("validateCookieDomain", () => {
  test("returns undefined for undefined input", () => {
    expect(validateCookieDomain(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(validateCookieDomain("")).toBeUndefined();
  });

  test("passes 2-label domain that starts with dot", () => {
    expect(validateCookieDomain(".isusystem.com")).toBe(".isusystem.com");
  });

  test("passes 3-label subdomain", () => {
    expect(validateCookieDomain(".foo.isusystem.com")).toBe(".foo.isusystem.com");
  });

  test("throws when domain does not start with dot", () => {
    expect(() => validateCookieDomain("isusystem.com")).toThrow(/must start with/);
  });

  test("throws on overly broad single-label .com", () => {
    expect(() => validateCookieDomain(".com")).toThrow(/too broad/);
  });

  test("throws on bare TLD .localhost", () => {
    expect(() => validateCookieDomain(".localhost")).toThrow(/too broad/);
  });

  test("throws on lone dot", () => {
    expect(() => validateCookieDomain(".")).toThrow(/too broad/);
  });
});
