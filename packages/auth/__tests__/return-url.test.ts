import { describe, expect, test } from "vitest";
import { validateReturnUrl } from "../return-url.js";

const ALLOWED = ["jarvis.isusystem.com", "yess.isusystem.com"] as const;
const FALLBACK = "/dashboard";

describe("validateReturnUrl", () => {
  test("returns fallback for null", () => {
    expect(validateReturnUrl(null, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for undefined", () => {
    expect(validateReturnUrl(undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for empty string", () => {
    expect(validateReturnUrl("", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes path starting with /", () => {
    expect(validateReturnUrl("/foo", ALLOWED, FALLBACK)).toBe("/foo");
  });

  test("passes path with query and hash", () => {
    expect(validateReturnUrl("/foo?x=1#bar", ALLOWED, FALLBACK)).toBe("/foo?x=1#bar");
  });

  test("rejects scheme-relative URL (//host)", () => {
    expect(validateReturnUrl("//attacker.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects backslash-prefixed path (/\\\\host)", () => {
    expect(validateReturnUrl("/\\\\attacker.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects path with control characters", () => {
    expect(validateReturnUrl("/foo\nbar", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes full https URL with whitelisted host", () => {
    const url = "https://yess.isusystem.com/dashboard";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });

  test("passes full http URL with whitelisted host", () => {
    const url = "http://yess.isusystem.com/foo";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });

  test("rejects full URL with non-whitelisted host", () => {
    expect(validateReturnUrl("https://attacker.com/foo", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects javascript: scheme", () => {
    expect(validateReturnUrl("javascript:alert(1)", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects data: scheme", () => {
    expect(
      validateReturnUrl("data:text/html,<script>alert(1)</script>", ALLOWED, FALLBACK),
    ).toBe(FALLBACK);
  });

  test("rejects malformed URL gracefully (no throw)", () => {
    expect(validateReturnUrl("not a url at all", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("preserves query string in whitelisted full URL", () => {
    const url = "https://yess.isusystem.com/path?x=1&y=2";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });
});
