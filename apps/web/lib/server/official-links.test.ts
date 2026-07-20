import { describe, expect, it } from "vitest";
import { buildCitationHref, isAllowedOfficialUrl } from "../official-links";

describe("official links", () => {
  it("allows only approved https hosts", () => {
    expect(isAllowedOfficialUrl("https://law.go.kr/lsInfoP.do?lsiSeq=1")).toBe(true);
    expect(isAllowedOfficialUrl("http://law.go.kr/lsInfoP.do?lsiSeq=1")).toBe(false);
    expect(isAllowedOfficialUrl("https://example.invalid/synthetic")).toBe(false);
  });

  it("falls back to wiki path when canonical url is not official", () => {
    expect(
      buildCitationHref({
        canonicalUrl: "https://example.invalid/synthetic",
        wikiPath: "auto/concepts/average-wage.md",
      }),
    ).toBe("/wiki/auto/concepts/average-wage");
  });
});
