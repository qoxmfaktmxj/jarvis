/**
 * packages/shared/validation/infra/license.ts
 *
 * 인프라 운영 라이선스 (TBIZ500) Zod 스키마.
 * admin/infra/licenses 라우트와 saveInfraLicenses server action에서 사용.
 *
 * 22 모듈 boolean 키는 schema/infra-license.ts와 1:1 매핑.
 */
import { z } from "zod";

export const infraLicenseRow = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  legacyCompanyCd: z.string().nullable(),
  legacyCompanyNm: z.string().nullable(),
  symd: z.string().min(1), // ISO yyyy-MM-dd
  eymd: z.string().nullable(),
  devGbCode: z.string().min(1),
  domainAddr: z.string().nullable(),
  ipAddr: z.string().nullable(),
  userCnt: z.number().int().nullable(),
  corpCnt: z.number().int().nullable(),
  empYn: z.boolean(),
  hrYn: z.boolean(),
  orgYn: z.boolean(),
  eduYn: z.boolean(),
  papYn: z.boolean(),
  carYn: z.boolean(),
  cpnYn: z.boolean(),
  timYn: z.boolean(),
  benYn: z.boolean(),
  appYn: z.boolean(),
  eisYn: z.boolean(),
  sysYn: z.boolean(),
  yearYn: z.boolean(),
  boardYn: z.boolean(),
  wlYn: z.boolean(),
  pdsYn: z.boolean(),
  idpYn: z.boolean(),
  abhrYn: z.boolean(),
  workYn: z.boolean(),
  secYn: z.boolean(),
  docYn: z.boolean(),
  disYn: z.boolean(),
  // audit (output-only)
  createdAt: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  updatedBy: z.string().uuid().nullable().optional(),
});

export const listInfraLicensesInput = z.object({
  q: z.string().trim().optional(),
  devGbCode: z.string().trim().optional(),
  /** B10025 code group filter (alias kept for URL-param compatibility) */
  searchDevGbCd: z.string().trim().optional(),
  companyId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

/** Same filters as listInfraLicensesInput minus pagination — used by exportInfraLicenses. */
export const exportInfraLicensesInput = z.object({
  q: z.string().trim().optional(),
  devGbCode: z.string().trim().optional(),
  searchDevGbCd: z.string().trim().optional(),
  companyId: z.string().uuid().optional(),
});

export const listInfraLicensesOutput = z.object({
  rows: z.array(infraLicenseRow),
  total: z.number().int().min(0),
});

export const saveInfraLicensesInput = z.object({
  creates: z.array(infraLicenseRow).default([]),
  updates: z
    .array(z.object({ id: z.string().uuid(), patch: infraLicenseRow.partial() }))
    .default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveInfraLicensesOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type InfraLicenseRow = z.infer<typeof infraLicenseRow>;
export type ListInfraLicensesInput = z.infer<typeof listInfraLicensesInput>;
export type ListInfraLicensesOutput = z.infer<typeof listInfraLicensesOutput>;
export type ExportInfraLicensesInput = z.infer<typeof exportInfraLicensesInput>;
export type SaveInfraLicensesInput = z.infer<typeof saveInfraLicensesInput>;
export type SaveInfraLicensesOutput = z.infer<typeof saveInfraLicensesOutput>;
