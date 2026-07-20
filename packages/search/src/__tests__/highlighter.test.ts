import { describe, expect, it } from "vitest";
import { highlightSnippet } from "../index.js";

describe("highlightSnippet", () => {
  it("returns escaped parts instead of HTML injection", () => {
    expect(highlightSnippet("<script>alert(1)</script>", ["script"])).toEqual([
      { text: "&lt;", matched: false },
      { text: "script", matched: true },
      { text: "&gt;alert(1)&lt;/", matched: false },
      { text: "script", matched: true },
      { text: "&gt;", matched: false },
    ]);
  });

  it("limits output to a stable snippet window", () => {
    const longSnippet = `${"퇴직금 ".repeat(80)}끝`;
    const parts = highlightSnippet(longSnippet, []);
    expect(parts).toEqual([{ text: longSnippet.slice(0, 240), matched: false }]);
  });
});
