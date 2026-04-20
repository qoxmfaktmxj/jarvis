import { describe, it, expect } from "vitest";
import {
  computeGeneratedLeaveHours,
  computeLeaveHours,
  breakdownDayOff
} from "../leave-compute.js";

const D = (iso: string) => new Date(iso + "T00:00:00Z");

describe("computeGeneratedLeaveHours", () => {
  it("same day returns at least 8h (minimum month)", () => {
    expect(computeGeneratedLeaveHours(D("2026-03-04"), D("2026-03-04"))).toBeGreaterThanOrEqual(8);
  });
  it("184 inclusive days (3/4~9/3) → ceil(184/30)=7 → 56h", () => {
    expect(computeGeneratedLeaveHours(D("2026-03-04"), D("2026-09-03"))).toBe(56);
  });
  it("181 days (2/28~8/27) → 7 months → 56h", () => {
    expect(computeGeneratedLeaveHours(D("2026-02-28"), D("2026-08-27"))).toBe(56);
  });
  it("end < start returns 0", () => {
    expect(computeGeneratedLeaveHours(D("2026-05-01"), D("2026-04-01"))).toBe(0);
  });
});

describe("computeLeaveHours", () => {
  const holidays = new Set<string>(["2026-05-05"]);

  it("day_off without holidays: 3 days = 24h", () => {
    expect(computeLeaveHours({
      type: "day_off",
      startDate: D("2026-04-13"), endDate: D("2026-04-15"),
      holidays: new Set()
    })).toBe(24);
  });

  it("day_off spanning weekend: counts only weekdays", () => {
    expect(computeLeaveHours({
      type: "day_off",
      startDate: D("2026-04-17"), endDate: D("2026-04-20"),
      holidays: new Set()
    })).toBe(16);
  });

  it("day_off excludes holiday", () => {
    expect(computeLeaveHours({
      type: "day_off",
      startDate: D("2026-05-04"), endDate: D("2026-05-08"),
      holidays
    })).toBe(32);
  });

  it("half_am returns 4h", () => {
    expect(computeLeaveHours({
      type: "half_am",
      startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(4);
  });

  it("half_pm returns 4h", () => {
    expect(computeLeaveHours({
      type: "half_pm",
      startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(4);
  });

  it("hourly: time_from/to difference rounded to hour", () => {
    expect(computeLeaveHours({
      type: "hourly",
      startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      timeFrom: new Date("2026-04-10T14:00:00Z"),
      timeTo: new Date("2026-04-10T16:30:00Z"),
      holidays: new Set()
    })).toBe(3);
  });

  it("sick returns 0 (연차 미차감)", () => {
    expect(computeLeaveHours({
      type: "sick",
      startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(0);
  });

  it("public returns 0", () => {
    expect(computeLeaveHours({
      type: "public",
      startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(0);
  });
});

describe("breakdownDayOff", () => {
  it("excludes weekends and holidays", () => {
    const r = breakdownDayOff({
      startDate: D("2026-05-04"), endDate: D("2026-05-08"),  // 월~금, 5/5 공휴일
      holidays: new Set(["2026-05-05"])
    });
    expect(r.totalDays).toBe(5);
    expect(r.workDays).toBe(4);
    expect(r.holidayDays).toBe(1);
    expect(r.hours).toBe(32);
  });

  it("span including weekend and holiday", () => {
    const r = breakdownDayOff({
      startDate: D("2026-05-02"), endDate: D("2026-05-08"),  // 토~금 7일
      holidays: new Set(["2026-05-05"])
    });
    expect(r.totalDays).toBe(7);
    // 토일 2 + 5/5 공휴일 1 = 3, work = 4
    expect(r.workDays).toBe(4);
    expect(r.holidayDays).toBe(3);
  });
});
