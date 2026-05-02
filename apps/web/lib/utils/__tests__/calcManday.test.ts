import { describe, expect, it } from "vitest";
import { calcManday, DEFAULT_MANDAY_WEIGHTS } from "../calcManday";

/**
 * Calendar reference for tests:
 *   2026-01-05 (Mon) ~ 2026-01-09 (Fri) → 5 weekdays
 *   2026-01-05 (Mon) ~ 2026-01-11 (Sun) → 5 weekdays + 1 Sat + 1 Sun
 *   2026-01-10 (Sat)
 *   2026-01-11 (Sun)
 *   2026-01-07 (Wed) — used as a "holiday" in the holiday-override test
 */
describe("calcManday", () => {
  it("returns 5.0 for a pure 5-weekday range Mon-Fri", () => {
    // 2026-01-05 Mon .. 2026-01-09 Fri
    expect(calcManday("20260105", "20260109")).toBe(5);
  });

  it("returns 5.5 for a full week Mon-Sun (Sat=0.5, Sun=0)", () => {
    // 2026-01-05 Mon .. 2026-01-11 Sun
    // 5 weekdays (1.0 each) + 1 Sat (0.5) + 1 Sun (0) = 5.5
    expect(calcManday("20260105", "20260111")).toBe(5.5);
  });

  it("returns 0.5 for a single Saturday", () => {
    // 2026-01-10 is a Saturday
    expect(calcManday("20260110", "20260110")).toBe(0.5);
  });

  it("returns 0 for a single Sunday", () => {
    // 2026-01-11 is a Sunday
    expect(calcManday("20260111", "20260111")).toBe(0);
  });

  it("replaces weekday weight with holiday=0 when a weekday is in the holiday set", () => {
    // Mon-Fri = 5.0 normally. Mark Wed (2026-01-07) as a holiday → 4.0
    const holidays = new Set<string>(["20260107"]);
    expect(calcManday("20260105", "20260109", holidays)).toBe(4);
  });

  it("returns null for null/undefined inputs", () => {
    expect(calcManday(null, "20260105")).toBeNull();
    expect(calcManday("20260105", null)).toBeNull();
    expect(calcManday(undefined, undefined)).toBeNull();
    expect(calcManday("", "")).toBeNull();
  });

  it("returns null for malformed inputs", () => {
    expect(calcManday("2026-01-05", "20260109")).toBeNull(); // dashes
    expect(calcManday("2026010", "20260109")).toBeNull(); // 7 digits
    expect(calcManday("20261301", "20260109")).toBeNull(); // invalid month
    expect(calcManday("20260132", "20260109")).toBeNull(); // invalid day
    expect(calcManday("abcdefgh", "20260109")).toBeNull();
  });

  it("returns null when end < start", () => {
    expect(calcManday("20260109", "20260105")).toBeNull();
  });

  it("supports a 'no weekend penalty' custom weight set", () => {
    const weights = { weekday: 1, saturday: 1, sunday: 1, holiday: 0 };
    // Mon-Sun = 7 days, all weight 1 = 7.0
    expect(calcManday("20260105", "20260111", new Set(), weights)).toBe(7);
  });

  it("returns 1.0 for a same-day range on a weekday", () => {
    // 2026-01-05 is a Monday
    expect(calcManday("20260105", "20260105")).toBe(1);
  });

  it("returns the correct weight for a same-day range on a weekend", () => {
    // Saturday 2026-01-10 → 0.5
    expect(calcManday("20260110", "20260110")).toBe(0.5);
    // Sunday 2026-01-11 → 0
    expect(calcManday("20260111", "20260111")).toBe(0);
  });

  it("respects the holiday weight from a custom weight set", () => {
    // Mark Tue (2026-01-06) as holiday with weight 0.5 → total 4 weekdays + 0.5 = 4.5
    const weights = { ...DEFAULT_MANDAY_WEIGHTS, holiday: 0.5 };
    const holidays = new Set<string>(["20260106"]);
    expect(calcManday("20260105", "20260109", holidays, weights)).toBe(4.5);
  });

  it("handles month/year boundary crossings correctly", () => {
    // 2026-12-28 (Mon) .. 2027-01-03 (Sun) → 7 days = Mon-Fri (5.0) + Sat (0.5) + Sun (0) = 5.5
    expect(calcManday("20261228", "20270103")).toBe(5.5);
  });

  it("returns rounded value to 1 decimal", () => {
    // 3 Saturdays and a Friday: 0.5 + 0.5 + 0.5 + 1 = 2.5 — already clean,
    // but ensure rounding behaves: weights.weekday=0.333 over 3 weekdays = 0.999 -> 1
    const weights = { weekday: 0.333, saturday: 0, sunday: 0, holiday: 0 };
    // 3 weekdays Mon-Wed
    expect(calcManday("20260105", "20260107", new Set(), weights)).toBe(1);
  });
});
