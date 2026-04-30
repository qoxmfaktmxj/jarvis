import { describe, expect, it } from "vitest";
import { kstNow } from "./quiz-season-rotate.js";

describe("kstNow", () => {
  it("first day of month at 00:00 KST → day=1", () => {
    // 2026-05-01 00:00 KST == 2026-04-30 15:00 UTC
    const utc = new Date(Date.UTC(2026, 3, 30, 15, 0, 0));
    const k = kstNow(utc);
    expect(k.day).toBe(1);
    expect(k.date).toBe("2026-05-01");
    expect(k.monthLabel).toBe("2026-05");
  });

  it("last day of month at 23:59 KST → day=last", () => {
    const utc = new Date(Date.UTC(2026, 3, 30, 14, 59, 0));
    const k = kstNow(utc);
    expect(k.day).toBe(30);
    expect(k.monthLabel).toBe("2026-04");
  });

  it("crosses year boundary correctly", () => {
    // 2027-01-01 00:01 KST == 2026-12-31 15:01 UTC
    const utc = new Date(Date.UTC(2026, 11, 31, 15, 1, 0));
    const k = kstNow(utc);
    expect(k.day).toBe(1);
    expect(k.monthLabel).toBe("2027-01");
  });
});
