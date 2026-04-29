import { describe, it, expect, test } from "vitest";
import { safeRedirectPath, safeReturnUrl } from "./safe-redirect";

describe("safeRedirectPath", () => {
  const fallback = "/dashboard";

  it.each([
    ["/wiki", "/wiki"],
    ["/ask/abc", "/ask/abc"],
    ["/dashboard?tab=activity", "/dashboard?tab=activity"],
    ["/wiki#section", "/wiki#section"],
  ])("passes through safe internal path %s", (input, expected) => {
    expect(safeRedirectPath(input, fallback)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/path",
    "/\\\\evil.com",
    "\\\\evil.com",
    "http://evil.com",
    "https://evil.com/a",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "",
    "dashboard",
  ])("falls back for unsafe redirect %s", (input) => {
    expect(safeRedirectPath(input, fallback)).toBe(fallback);
  });

  it("falls back when input is null or undefined", () => {
    expect(safeRedirectPath(null, fallback)).toBe(fallback);
    expect(safeRedirectPath(undefined, fallback)).toBe(fallback);
  });
});

describe("safeReturnUrl", () => {
  const ALLOWED = ["jarvis.isusystem.com", "yess.isusystem.com"] as const;
  const FALLBACK = "/dashboard";

  test("returns fallback for null", () => {
    expect(safeReturnUrl(null, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for undefined", () => {
    expect(safeReturnUrl(undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for empty string", () => {
    expect(safeReturnUrl("", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("delegates path to safeRedirectPath", () => {
    expect(safeReturnUrl("/foo", ALLOWED, FALLBACK)).toBe("/foo");
    expect(safeReturnUrl("/foo?x=1#bar", ALLOWED, FALLBACK)).toBe("/foo?x=1#bar");
  });

  test("rejects //host via path branch", () => {
    expect(safeReturnUrl("//evil.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes whitelisted full URL", () => {
    expect(safeReturnUrl("https://yess.isusystem.com/dashboard", ALLOWED, FALLBACK))
      .toBe("https://yess.isusystem.com/dashboard");
  });

  test("rejects non-whitelisted full URL", () => {
    expect(safeReturnUrl("https://attacker.com/foo", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects javascript: scheme", () => {
    expect(safeReturnUrl("javascript:alert(1)", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects data: scheme", () => {
    expect(safeReturnUrl("data:text/html,<x>", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects malformed URL", () => {
    expect(safeReturnUrl("not a url", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });
});
