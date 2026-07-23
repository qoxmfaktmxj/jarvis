import { describe, expect, it } from "vitest";
import { locateSourceSegment } from "../agent/tools/source-read.js";
import { selectWikiExcerpt } from "../agent/tools/wiki-read.js";

describe("evidence excerpts", () => {
  it("keeps a selected source paragraph with its immediate context within the cap", () => {
    const before = `이전 문단 ${"가".repeat(900)}`;
    const selected = `식대 비과세 한도는 월 20만원입니다. ${"나".repeat(1_200)}`;
    const after = `다음 문단 ${"다".repeat(900)}`;

    const excerpt = locateSourceSegment(`${before}\n\n${selected}\n\n${after}`, "paragraph:2");

    expect(excerpt).toContain("식대 비과세 한도는 월 20만원입니다.");
    expect(excerpt?.length).toBeLessThanOrEqual(2_000);
  });

  it("selects the wiki section that matches the Ask AI question", () => {
    const body = [
      "# 원천징수 안내",
      "\n\n",
      "## 퇴직소득\n퇴직소득 관련 안내입니다.\n\n",
      `## 식대 비과세\n현금 식대 비과세 한도는 월 20만원입니다.\n${"근거 ".repeat(2_000)}\n\n`,
      `## 평균임금\n${"평균임금 ".repeat(2_000)}`,
    ].join("");

    const excerpt = selectWikiExcerpt(body, "현금 식대 비과세 한도는 얼마야?");

    expect(excerpt).toContain("현금 식대 비과세 한도는 월 20만원입니다.");
    expect(excerpt).not.toContain("평균임금 평균임금");
    expect(excerpt.length).toBeLessThanOrEqual(6_000);
  });
});
