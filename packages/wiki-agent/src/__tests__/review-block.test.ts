import { describe, expect, it } from "vitest";

import { parseReviewBlocks } from "../index.js";

describe("parseReviewBlocks", () => {
  it("extracts review metadata and strips meta lines from the body", () => {
    const parsed = parseReviewBlocks([
      "---REVIEW: contradiction | 기준 충돌 확인---",
      "두 합성 근거의 기준일이 다릅니다.",
      "OPTIONS: Resolve | Dismiss",
      "PAGES: auto/concepts/a.md, auto/concepts/b.md",
      "SEARCH: 기준일 | 적용 범위",
      "---END REVIEW---",
    ].join("\r\n"));

    expect(parsed).toEqual([{
      type: "contradiction",
      title: "기준 충돌 확인",
      body: "두 합성 근거의 기준일이 다릅니다.",
      options: ["Resolve", "Dismiss"],
      pages: ["auto/concepts/a.md", "auto/concepts/b.md"],
      search: ["기준일", "적용 범위"],
    }]);
  });

  it("drops malformed or incomplete reviews", () => {
    expect(parseReviewBlocks("---REVIEW: missing delimiter---\nbody\n---END REVIEW---")).toEqual([]);
    expect(parseReviewBlocks("---REVIEW: lint | incomplete---\nbody")).toEqual([]);
  });
});
