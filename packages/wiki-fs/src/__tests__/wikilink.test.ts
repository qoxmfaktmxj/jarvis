import { describe, expect, it } from "vitest";

import { formatWikilink, parseWikilink, parseWikilinks, renderWikilinks } from "../wikilink.js";

describe("wikilinks", () => {
  it("parses target, anchor, and alias forms", () => {
    expect(parseWikilink("[[휴가-정책]]")).toMatchObject({ target: "휴가-정책" });
    expect(parseWikilink("[[concepts/평균임금#정의|평균임금]]")).toMatchObject({
      target: "concepts/평균임금",
      anchor: "정의",
      alias: "평균임금",
    });
    expect(parseWikilinks("[[a]] 뒤 [[b|별칭]]").map(({ target }) => target)).toEqual(["a", "b"]);
  });

  it("rejects control, delimiter, and non-NFC components", () => {
    expect(parseWikilink("[[bad\u0007]]")).toBeNull();
    expect(parseWikilink("[[Cafe\u0301]]")).toBeNull();
    expect(parseWikilink("[[a|b|c]]")).toBeNull();
    expect(() => formatWikilink({ target: "safe", alias: "bad]" })).toThrow(/unsafe/i);
  });

  it("renders only valid links and formats canonical order", () => {
    expect(renderWikilinks("[[ok]] [[]]", ({ target }) => `<${target}>`)).toBe("<ok> [[]]");
    expect(formatWikilink({ target: "concepts/wage", anchor: "rule", alias: "임금" })).toBe(
      "[[concepts/wage#rule|임금]]",
    );
  });
});
