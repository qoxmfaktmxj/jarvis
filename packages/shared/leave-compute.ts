export type LeaveType =
  | "day_off"
  | "half_am"
  | "half_pm"
  | "hourly"
  | "sick"
  | "public";

/**
 * 계약 기간을 바탕으로 자동 생성 연차 시간 제안값.
 * 규칙: 1일 = 8시간. 단순 ceil(inclusiveDays / 30) * 8.
 * 실제 운영은 담당자 override 가능 — 정확 값보다 "제안"으로 사용.
 */
export function computeGeneratedLeaveHours(start: Date, end: Date): number {
  const msPerDay = 86400000;
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (inclusiveDays <= 0) return 0;
  const monthsCeil = Math.ceil(inclusiveDays / 30);
  return monthsCeil * 8;
}

export function computeLeaveHours(args: {
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  timeFrom?: Date;
  timeTo?: Date;
  holidays: Set<string>; // "YYYY-MM-DD"
}): number {
  const { type, startDate, endDate, timeFrom, timeTo, holidays } = args;

  if (type === "sick" || type === "public") return 0;
  if (type === "half_am" || type === "half_pm") return 4;

  if (type === "hourly") {
    if (!timeFrom || !timeTo) {
      throw new Error("hourly leave requires timeFrom and timeTo");
    }
    const diffHours = (timeTo.getTime() - timeFrom.getTime()) / 3600000;
    return Math.max(1, Math.round(diffHours));
  }

  // day_off: 공휴일·주말 제외한 일수 * 8
  let count = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    const dow = d.getUTCDay();
    const key = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count * 8;
}

/**
 * UI 미리보기용. 신청 범위 내 총일수·근무일수·휴일수·차감 시간 반환.
 */
export function breakdownDayOff(args: {
  startDate: Date;
  endDate: Date;
  holidays: Set<string>;
}): { totalDays: number; workDays: number; holidayDays: number; hours: number } {
  const { startDate, endDate, holidays } = args;
  let total = 0;
  let work = 0;
  let holidayCount = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    total++;
    const dow = d.getUTCDay();
    const key = d.toISOString().slice(0, 10);
    if (dow === 0 || dow === 6) {
      holidayCount++;
    } else if (holidays.has(key)) {
      holidayCount++;
    } else {
      work++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { totalDays: total, workDays: work, holidayDays: holidayCount, hours: work * 8 };
}
