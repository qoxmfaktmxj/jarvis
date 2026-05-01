import { z } from "zod";

export const customerRow = z.object({
  id: z.string().uuid(),
  custCd: z.string().min(1).max(50),
  custNm: z.string().min(1).max(500),
  custKindCd: z.string().nullable(),
  custDivCd: z.string().nullable(),
  exchangeTypeCd: z.string().nullable(),
  custSourceCd: z.string().nullable(),
  custImprCd: z.string().nullable(),
  buyInfoCd: z.string().nullable(),
  buyInfoDtCd: z.string().nullable(),
  ceoNm: z.string().nullable(),
  telNo: z.string().nullable(),
  businessNo: z.string().nullable(),
  faxNo: z.string().nullable(),
  businessKind: z.string().nullable(),
  homepage: z.string().nullable(),
  addrNo: z.string().nullable(),
  addr1: z.string().nullable(),
  addr2: z.string().nullable(),
  // 등록일자 (read-only display; server sets defaultNow on insert).
  createdAt: z.string().nullable().optional(),
});

export const listCustomersInput = z.object({
  q: z.string().optional(),
  custCd: z.string().optional(),
  custNm: z.string().optional(),
  custKindCd: z.string().optional(),
  custDivCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listCustomersOutput = z.object({
  rows: z.array(customerRow),
  total: z.number().int().min(0),
});

export const saveCustomersInput = z.object({
  creates: z.array(customerRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: customerRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveCustomersOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type CustomerRow = z.infer<typeof customerRow>;
export type ListCustomersInput = z.infer<typeof listCustomersInput>;
export type SaveCustomersInput = z.infer<typeof saveCustomersInput>;
export type SaveCustomersOutput = z.infer<typeof saveCustomersOutput>;
