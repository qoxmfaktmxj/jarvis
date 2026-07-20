import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../index.js";

describe("parseSearchQuery", () => {
  it("normalizes whitespace, clamps length, and strips tsquery operators from tokens", () => {
    expect(parseSearchQuery(`  평균임금  !!  "통상 임금"  OR  `)).toEqual({
      normalized: `평균임금 "통상 임금" OR`,
      tsQueryText: `평균임금 "통상 임금" OR`,
      trigramText: `평균임금 통상 임금 OR`,
      terms: ["평균임금", "통상", "임금", "OR"],
    });
  });

  it("returns null when the query becomes empty after normalization", () => {
    expect(parseSearchQuery(`"'&|:()--"`)).toBeNull();
  });
});
