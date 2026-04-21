import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

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
