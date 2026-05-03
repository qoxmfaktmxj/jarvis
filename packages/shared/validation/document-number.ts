import { z } from "zod";
import { ISO_DATE } from "./holidays.js";

const yearStr = z.string().regex(/^\d{4}$/, "yyyy 형식이어야 합니다.");

export const documentNumberRowSchema = z.object({
  id: z.string().uuid(),
  year: yearStr,
  seq: z.number().int(),
  docNo: z.string().max(30),
  docName: z.string().min(1).max(300),
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  userEmployeeId: z.string().nullable(),
  docDate: ISO_DATE.nullable(),
  note: z.string().max(2000).nullable(),
  updatedBy: z.string().max(50).nullable(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type DocumentNumberRow = z.infer<typeof documentNumberRowSchema>;

export const documentNumberCreateInput = z.object({
  year: yearStr,
  docName: z.string().min(1).max(300),
  userId: z.string().uuid().nullable(),
  docDate: ISO_DATE.nullable(),
  note: z.string().max(2000).nullable(),
});
export type DocumentNumberCreateInput = z.infer<typeof documentNumberCreateInput>;

export const documentNumberUpdateInput = z.object({
  id: z.string().uuid(),
  docName: z.string().min(1).max(300).optional(),
  userId: z.string().uuid().nullable().optional(),
  docDate: ISO_DATE.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export type DocumentNumberUpdateInput = z.infer<typeof documentNumberUpdateInput>;

export const listDocumentNumbersInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  q: z.string().max(200).optional(),
  year: yearStr.optional(),
});
export type ListDocumentNumbersInput = z.infer<typeof listDocumentNumbersInput>;

export const listDocumentNumbersOutput = z.object({
  ok: z.boolean(),
  rows: z.array(documentNumberRowSchema),
  total: z.number().int(),
});
export type ListDocumentNumbersOutput = z.infer<typeof listDocumentNumbersOutput>;

export const saveDocumentNumbersInput = z.object({
  creates: z.array(documentNumberCreateInput).default([]),
  updates: z.array(documentNumberUpdateInput).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
export type SaveDocumentNumbersInput = z.infer<typeof saveDocumentNumbersInput>;

export const saveDocumentNumbersOutput = z.object({
  ok: z.boolean(),
  inserted: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  error: z.string().optional(),
});
export type SaveDocumentNumbersOutput = z.infer<typeof saveDocumentNumbersOutput>;

/**
 * "HS-{yy}-{seq:03d}" 형식 docNo 생성. legacy TSMT050 호환.
 * 향후 workspace 별 prefix 설정 가능하도록 확장 예정.
 */
export function buildDocNo(year: string, seq: number, prefix = "HS"): string {
  const yy = year.slice(-2);
  const seqStr = String(seq).padStart(3, "0");
  return `${prefix}-${yy}-${seqStr}`;
}
