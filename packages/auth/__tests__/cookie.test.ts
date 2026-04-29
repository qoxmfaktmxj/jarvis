import { describe, expect, test } from "vitest";
import { validateCookieDomain } from "../cookie.js";
import { buildSessionCookieOptions } from "../cookie.js";

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

describe("buildSessionCookieOptions", () => {
  test("omits domain when cookieDomain is undefined", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      8 * 60 * 60 * 1000,
    );
    expect(opts.domain).toBeUndefined();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.secure).toBe(false);
  });

  test("includes domain when cookieDomain is set and production secure", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: ".isusystem.com", isProduction: true },
      8 * 60 * 60 * 1000,
    );
    expect(opts.domain).toBe(".isusystem.com");
    expect(opts.secure).toBe(true);
  });

  test("converts lifetimeMs to maxAge in seconds (floor)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      8 * 60 * 60 * 1000,
    );
    expect(opts.maxAge).toBe(8 * 60 * 60);
  });

  test("handles 30-day lifetime (keepSignedIn)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      30 * 24 * 60 * 60 * 1000,
    );
    expect(opts.maxAge).toBe(30 * 24 * 60 * 60);
  });

  test("propagates validateCookieDomain throw on invalid domain", () => {
    expect(() =>
      buildSessionCookieOptions(
        { cookieDomain: ".com", isProduction: true },
        1000,
      ),
    ).toThrow(/too broad/);
  });

  test("zero lifetime yields maxAge 0 (for cookie clear)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: ".isusystem.com", isProduction: true },
      0,
    );
    expect(opts.maxAge).toBe(0);
    expect(opts.domain).toBe(".isusystem.com");
  });
});
