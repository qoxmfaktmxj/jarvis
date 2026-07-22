import { describe, expect, it } from "vitest";
import { formatDateTimeKst } from "./format-date-time";

describe("formatDateTimeKst", () => {
  it("formats a valid value in Korea time without milliseconds", () => {
    expect(formatDateTimeKst("2026-07-22T06:01:02.999Z")).toBe("2026-07-22 15:01:02");
  });

  it("returns an empty string for invalid input", () => {
    expect(formatDateTimeKst("invalid")).toBe("");
  });
});
