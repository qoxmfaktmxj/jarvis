import { describe, expect, it } from "vitest";
import { stripInternalSourceCitations } from "./AnswerBody";

describe("stripInternalSourceCitations", () => {
  it("removes the internal source marker and its bare slug", () => {
    expect(
      stripInternalSourceCitations(
        "식대 비과세 한도는 월 20만원입니다. withholding-ch06-meal-allowance-f-a00008 [source:7b452111-1dfd-4fc7-b1fa-7287decceb6f#fact-f-a00008]",
      ),
    ).toBe("식대 비과세 한도는 월 20만원입니다.");
  });

  it("removes a standalone Fact ID and every inline verification citation", () => {
    expect(
      stripInternalSourceCitations(
        "식대 비과세 한도는 월 20만원입니다. withholding-ch06-meal-allowance-f-a00008 [[average-wage]] [source:7b452111-1dfd-4fc7-b1fa-7287decceb6f#fact-f-a00008]",
      ),
    ).toBe("식대 비과세 한도는 월 20만원입니다.");
  });
});
