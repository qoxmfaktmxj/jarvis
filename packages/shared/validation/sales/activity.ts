import { z } from "zod";

export const activityRow = z.object({
  id: z.string().uuid(),
  bizActNm: z.string().min(1).max(500),
  opportunityId: z.string().uuid().nullable(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  actYmd: z.string().nullable(),
  actTypeCode: z.string().nullable(),
  accessRouteCode: z.string().nullable(),
  attendeeUserId: z.string().uuid().nullable(),
  attendeeUserName: z.string().nullable(),
  bizStepCode: z.string().nullable(),
  productTypeCode: z.string().nullable(),
  actContent: z.string().nullable(),
  // 등록일자 (read-only display; server sets defaultNow on insert).
  insDate: z.string().nullable().optional(),
});
export type ActivityRow = z.infer<typeof activityRow>;

export const listActivitiesInput = z.object({
  q: z.string().optional(),
  opportunityId: z.string().uuid().optional(),
  actTypeCode: z.string().optional(),
  bizStepCode: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListActivitiesInput = z.infer<typeof listActivitiesInput>;

export const listActivitiesOutput = z.object({
  rows: z.array(activityRow),
  total: z.number().int().min(0),
});

export const saveActivitiesInput = z.object({
  creates: z.array(activityRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: activityRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveActivitiesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type SaveActivitiesInput = z.infer<typeof saveActivitiesInput>;
export type SaveActivitiesOutput = z.infer<typeof saveActivitiesOutput>;
