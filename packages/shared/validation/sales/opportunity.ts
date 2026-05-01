import { z } from "zod";

export const opportunityRow = z.object({
  id: z.string().uuid(),
  bizOpNm: z.string().min(1).max(500),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  productTypeCode: z.string().nullable(),
  bizStepCode: z.string().nullable(),
  bizStepYmd: z.string().nullable(),
  orgNm: z.string().nullable(),
  insUserId: z.string().uuid().nullable(),
  insUserName: z.string().nullable(),
  bizOpSourceCode: z.string().nullable(),
  focusMgrYn: z.boolean().default(false),
  // 등록일자 (read-only display; server sets defaultNow on insert).
  insDate: z.string().nullable().optional(),
});
export type OpportunityRow = z.infer<typeof opportunityRow>;

export const listOpportunitiesInput = z.object({
  q: z.string().optional(),
  bizStepCode: z.string().optional(),
  productTypeCode: z.string().optional(),
  focusOnly: z.coerce.boolean().optional(),
  customerId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListOpportunitiesInput = z.infer<typeof listOpportunitiesInput>;

export const listOpportunitiesOutput = z.object({
  rows: z.array(opportunityRow),
  total: z.number().int().min(0),
});

export const saveOpportunitiesInput = z.object({
  creates: z.array(opportunityRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: opportunityRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveOpportunitiesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type SaveOpportunitiesInput = z.infer<typeof saveOpportunitiesInput>;
export type SaveOpportunitiesOutput = z.infer<typeof saveOpportunitiesOutput>;
