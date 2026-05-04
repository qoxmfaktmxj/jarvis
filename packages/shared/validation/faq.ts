import { z } from "zod";

export const faqEntryRowSchema = z.object({
  id: z.string().uuid(),
  seq: z.number().int(),
  bizCode: z.string().max(20).nullable(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
  fileSeq: z.string().max(50).nullable(),
  updatedBy: z.string().max(50).nullable(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type FaqEntryRow = z.infer<typeof faqEntryRowSchema>;

export const faqCreateInput = z.object({
  bizCode: z.string().max(20).nullable(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
  fileSeq: z.string().max(50).nullable(),
});
export type FaqCreateInput = z.infer<typeof faqCreateInput>;

export const faqUpdateInput = z.object({
  id: z.string().uuid(),
  bizCode: z.string().max(20).nullable().optional(),
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).optional(),
  fileSeq: z.string().max(50).nullable().optional(),
});
export type FaqUpdateInput = z.infer<typeof faqUpdateInput>;

export const listFaqInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  q: z.string().max(200).optional(),
  bizCode: z.string().max(20).optional(),
});
export type ListFaqInput = z.infer<typeof listFaqInput>;

export const listFaqOutput = z.object({
  ok: z.boolean(),
  rows: z.array(faqEntryRowSchema),
  total: z.number().int(),
});
export type ListFaqOutput = z.infer<typeof listFaqOutput>;

export const saveFaqInput = z.object({
  creates: z.array(faqCreateInput).default([]),
  updates: z.array(faqUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SaveFaqInput = z.infer<typeof saveFaqInput>;

export const saveFaqOutput = z.object({
  ok: z.boolean(),
  inserted: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  error: z.string().optional(),
});
export type SaveFaqOutput = z.infer<typeof saveFaqOutput>;
