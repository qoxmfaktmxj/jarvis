import { z } from "zod";

export const licenseRow = z.object({
  id: z.string().uuid(),
  licenseNo: z.string().min(1).max(100),
  customerId: z.string().uuid().nullable(),
  productCd: z.string().nullable(),
  licenseKindCd: z.string().nullable(),
  sdate: z.string().nullable(), // ISO date yyyy-MM-dd
  edate: z.string().nullable(),
  qty: z.number().int().nullable(),
  remark: z.string().nullable(),
});

export const listLicensesInput = z.object({
  licenseNo: z.string().optional(),
  customerId: z.string().uuid().optional(),
  licenseKindCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listLicensesOutput = z.object({
  rows: z.array(licenseRow),
  total: z.number().int().min(0),
});

export const saveLicensesInput = z.object({
  creates: z.array(licenseRow).default([]),
  updates: z.array(z.object({ id: z.string().uuid(), patch: licenseRow.partial() })).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveLicensesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type LicenseRow = z.infer<typeof licenseRow>;
export type ListLicensesInput = z.infer<typeof listLicensesInput>;
export type SaveLicensesInput = z.infer<typeof saveLicensesInput>;
export type SaveLicensesOutput = z.infer<typeof saveLicensesOutput>;
