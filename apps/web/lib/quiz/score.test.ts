import { describe, expect, it } from "vitest";
import { SCORE_TABLE, scoreFor } from "./score.js";

describe("scoreFor", () => {
  it("returns full points when correct", () => {
    expect(scoreFor("easy", true)).toBe(10);
    expect(scoreFor("medium", true)).toBe(20);
    expect(scoreFor("hard", true)).toBe(30);
  });

  it("returns 0 when wrong, regardless of difficulty", () => {
    expect(scoreFor("easy", false)).toBe(0);
    expect(scoreFor("medium", false)).toBe(0);
    expect(scoreFor("hard", false)).toBe(0);
  });

  it("table covers all 3 difficulties", () => {
    expect(Object.keys(SCORE_TABLE).sort()).toEqual(["easy", "hard", "medium"]);
  });
});
