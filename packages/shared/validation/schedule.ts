import { z } from "zod";
import { ISO_DATE } from "./holidays.js";

export const scheduleEventRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  userEmployeeId: z.string().nullable(),
  startDate: ISO_DATE,
  endDate: ISO_DATE,
  title: z.string().min(1).max(200),
  memo: z.string().max(2000).nullable(),
  orderSeq: z.number().int(),
  isShared: z.boolean(),
  updatedBy: z.string().max(50).nullable(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /** server-computed: 행 소유자가 현재 세션 사용자인가 (편집/삭제 권한) */
  isOwn: z.boolean(),
});
export type ScheduleEventRow = z.infer<typeof scheduleEventRowSchema>;

const dateRange = z
  .object({ startDate: ISO_DATE, endDate: ISO_DATE })
  .refine((v) => v.startDate <= v.endDate, {
    message: "시작일은 종료일보다 빠르거나 같아야 합니다.",
    path: ["endDate"],
  });

export const scheduleCreateInput = z
  .object({
    startDate: ISO_DATE,
    endDate: ISO_DATE,
    title: z.string().min(1).max(200),
    memo: z.string().max(2000).nullable(),
    orderSeq: z.number().int().min(0).default(0),
    isShared: z.boolean().default(false),
  })
  .and(dateRange);
export type ScheduleCreateInput = z.infer<typeof scheduleCreateInput>;

export const scheduleUpdateInput = z
  .object({
    id: z.string().uuid(),
    startDate: ISO_DATE.optional(),
    endDate: ISO_DATE.optional(),
    title: z.string().min(1).max(200).optional(),
    memo: z.string().max(2000).nullable().optional(),
    orderSeq: z.number().int().min(0).optional(),
    isShared: z.boolean().optional(),
  })
  .refine(
    (v) => {
      if (v.startDate !== undefined && v.endDate !== undefined) {
        return v.startDate <= v.endDate;
      }
      return true;
    },
    { message: "시작일은 종료일보다 빠르거나 같아야 합니다.", path: ["endDate"] },
  );
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateInput>;

export const listSchedulesInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  q: z.string().max(200).optional(),
  /** YYYY-MM-DD: 이 날짜를 포함하는 일정만 (start <= activeOn <= end) */
  activeOn: ISO_DATE.optional(),
  /** YYYY-MM (월) 필터: 이 월에 걸쳐 있는 일정 */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "yyyy-mm 형식이어야 합니다.")
    .optional(),
  /** 본인 일정만 (default true) — false면 본인 + 공유받은 일정 */
  ownOnly: z.boolean().default(true),
});
export type ListSchedulesInput = z.infer<typeof listSchedulesInput>;

export const listSchedulesOutput = z.object({
  ok: z.boolean(),
  rows: z.array(scheduleEventRowSchema),
  total: z.number().int(),
});
export type ListSchedulesOutput = z.infer<typeof listSchedulesOutput>;

export const saveSchedulesInput = z.object({
  creates: z.array(scheduleCreateInput).default([]),
  updates: z.array(scheduleUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SaveSchedulesInput = z.infer<typeof saveSchedulesInput>;

export const saveSchedulesOutput = z.object({
  ok: z.boolean(),
  inserted: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  error: z.string().optional(),
});
export type SaveSchedulesOutput = z.infer<typeof saveSchedulesOutput>;

/** 캘린더 뷰: 본인 + 공유 일정. 기간 범위 검색. */
export const listCalendarEventsInput = z
  .object({
    fromDate: ISO_DATE,
    toDate: ISO_DATE,
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate <= toDate",
    path: ["toDate"],
  })
  .refine(
    (v) => {
      const from = new Date(v.fromDate);
      const to = new Date(v.toDate);
      return (to.getTime() - from.getTime()) / 86_400_000 <= 92;
    },
    { message: "범위는 92일 이하만 허용됩니다.", path: ["toDate"] },
  );
export type ListCalendarEventsInput = z.infer<typeof listCalendarEventsInput>;
