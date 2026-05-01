import { z } from "zod";

export const productTypeRow = z.object({
  id: z.string().uuid(),
  productCd: z.string().min(1).max(50),
  productNm: z.string().min(1).max(300),
});

export const listProductTypesInput = z.object({
  productCd: z.string().optional(),
  productNm: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listProductTypesOutput = z.object({
  rows: z.array(productTypeRow),
  total: z.number().int().min(0),
});

export const saveProductTypesInput = z.object({
  creates: z.array(productTypeRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: productTypeRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveProductTypesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type ProductTypeRow = z.infer<typeof productTypeRow>;
export type ListProductTypesInput = z.infer<typeof listProductTypesInput>;
export type SaveProductTypesInput = z.infer<typeof saveProductTypesInput>;
export type SaveProductTypesOutput = z.infer<typeof saveProductTypesOutput>;
