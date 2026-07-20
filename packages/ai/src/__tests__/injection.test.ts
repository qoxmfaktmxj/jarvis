import { describe, expect, it } from "vitest";
import { locateSourceSegment } from "../agent/tools/source-read.js";

describe("locateSourceSegment", () => {
  it("bounds paragraph slices", () => {
    const long = `${"a".repeat(900)}\n\n두번째 문단`;
    expect(locateSourceSegment(long, "paragraph:1")?.length).toBe(800);
  });

  it("rejects oversized line ranges", () => {
    expect(locateSourceSegment("1\n2\n3", "line:1-25")).toBeNull();
    expect(locateSourceSegment("1\n2\n3", "line:0-1")).toBeNull();
    expect(locateSourceSegment("첫 문단", "paragraph:0")).toBeNull();
  });

  it("finds a bounded paragraph by an exact legal locator", () => {
    const text = "근로기준법 제2조를 참고한 평균임금 합성 예시입니다.\n\n다른 문단";
    expect(locateSourceSegment(text, "근로기준법 제2조")).toBe(
      "근로기준법 제2조를 참고한 평균임금 합성 예시입니다.",
    );
    expect(locateSourceSegment(text, ".*")).toBeNull();
  });
});
