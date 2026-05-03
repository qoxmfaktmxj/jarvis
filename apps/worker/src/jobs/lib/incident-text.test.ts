import { describe, it, expect } from "vitest";
import { stripHtml, splitByBytes } from "./incident-text.js";

describe("stripHtml", () => {
  it("removes html tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });
  it("removes self-closing tags", () => {
    expect(stripHtml("a<br/>b")).toBe("ab");
  });
  it("removes attributes", () => {
    expect(stripHtml('<div class="x">y</div>')).toBe("y");
  });
  it("preserves non-tag content", () => {
    expect(stripHtml("a > b < c")).toBe("a > b < c");
  });
});

describe("splitByBytes — UTF-8, 한글 3B", () => {
  it("splits ASCII at exact boundary", () => {
    expect(splitByBytes("a".repeat(5000), 0, 3999)).toBe("a".repeat(4000));
    expect(splitByBytes("a".repeat(5000), 4000, 7999)).toBe("a".repeat(1000));
  });
  it("splits 한글 without breaking character", () => {
    const s = "가".repeat(2000); // 6000 bytes
    const part1 = splitByBytes(s, 0, 3999);
    expect(Buffer.byteLength(part1, "utf-8")).toBeLessThanOrEqual(3999);
    expect(part1).toBe("가".repeat(1333)); // 1333 * 3 = 3999
  });
  it("returns empty when range exceeds string", () => {
    expect(splitByBytes("ab", 100, 200)).toBe("");
  });
});
