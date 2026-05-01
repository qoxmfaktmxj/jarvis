import { z } from "zod";

/* ============================================================
 * sales_contract (TBIZ030)
 * ============================================================ */

// row schema (조회 결과 — Drizzle column 1:1)
export const salesContractRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  // legacy
  legacyEnterCd: z.string().nullable(),
  legacyContYear: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  // company / customer
  companyType: z.string().nullable(),
  companyCd: z.string().nullable(),
  companyGrpNm: z.string().nullable(),
  companyNm: z.string().nullable(),
  companyNo: z.string().nullable(),
  customerNo: z.string().nullable(),
  customerEmail: z.string().nullable(),
  contNm: z.string().nullable(),
  custNm: z.string().nullable(),
  contGbCd: z.string().nullable(),
  contYmd: z.string().nullable(),
  contSymd: z.string().nullable(),
  contEymd: z.string().nullable(),
  mainContType: z.string().nullable(),
  newYn: z.string().nullable(),
  inOutType: z.string().nullable(),
  // amounts (Drizzle numeric() returns string | null)
  startAmt: z.string().nullable(),
  startAmtRate: z.string().nullable(),
  interimAmt1: z.string().nullable(),
  interimAmt2: z.string().nullable(),
  interimAmt3: z.string().nullable(),
  interimAmt4: z.string().nullable(),
  interimAmt5: z.string().nullable(),
  interimAmtRate1: z.string().nullable(),
  interimAmtRate2: z.string().nullable(),
  interimAmtRate3: z.string().nullable(),
  interimAmtRate4: z.string().nullable(),
  interimAmtRate5: z.string().nullable(),
  remainAmt: z.string().nullable(),
  remainAmtRate: z.string().nullable(),
  // guarantees / publication
  contImplYn: z.string().nullable(),
  contPublYn: z.string().nullable(),
  contGrtRate: z.string().nullable(),
  advanImplYn: z.string().nullable(),
  advanPublYn: z.string().nullable(),
  advanGrtRate: z.string().nullable(),
  defectImplYn: z.string().nullable(),
  defectPublYn: z.string().nullable(),
  defectGrtRate: z.string().nullable(),
  defectEymd: z.string().nullable(),
  inspecConfYmd: z.string().nullable(),
  // planned dates / publication flags (start/interim×5/remain)
  startAmtPlanYmd: z.string().nullable(),
  startAmtPublYn: z.string().nullable(),
  interimAmtPlanYmd1: z.string().nullable(),
  interimAmtPublYn1: z.string().nullable(),
  interimAmtPlanYmd2: z.string().nullable(),
  interimAmtPublYn2: z.string().nullable(),
  interimAmtPlanYmd3: z.string().nullable(),
  interimAmtPublYn3: z.string().nullable(),
  interimAmtPlanYmd4: z.string().nullable(),
  interimAmtPublYn4: z.string().nullable(),
  interimAmtPlanYmd5: z.string().nullable(),
  interimAmtPublYn5: z.string().nullable(),
  remainAmtPlanYmd: z.string().nullable(),
  remainAmtPublYn: z.string().nullable(),
  // misc
  befContNo: z.string().nullable(),
  contCancelYn: z.string().nullable(),
  contInitYn: z.string().nullable(),
  fileSeq: z.number().int().nullable(),
  docNo: z.string().nullable(),
  companyAddr: z.string().nullable(),
  companyOner: z.string().nullable(),
  sucProb: z.string().nullable(),
  memo: z.string().nullable(),
  // audit
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesContractRow = z.infer<typeof salesContractRowSchema>;

// list input
export const listContractsInput = z.object({
  q: z.string().optional(),
  customerNo: z.string().optional(),
  contGbCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export type ListContractsInput = z.infer<typeof listContractsInput>;

// create / update partial — server injects id/workspaceId/audit
const _contractCreateBase = salesContractRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).partial();

export const salesContractCreateSchema = _contractCreateBase;
export const salesContractUpdateSchema = _contractCreateBase.extend({ id: z.string().uuid() });

export type SalesContractCreate = z.infer<typeof salesContractCreateSchema>;
export type SalesContractUpdate = z.infer<typeof salesContractUpdateSchema>;

export const saveContractsInput = z.object({
  creates: z.array(salesContractCreateSchema).default([]),
  updates: z.array(salesContractUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SaveContractsInput = z.infer<typeof saveContractsInput>;

/* ============================================================
 * sales_contract_month (TBIZ031)
 * ============================================================ */

export const salesContractMonthRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contractId: z.string().uuid(),
  // legacy
  legacyContYear: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  legacySeq: z.number().int().nullable(),
  legacyYm: z.string().nullable(),
  // billing
  ym: z.string(),
  billTargetYn: z.string().nullable(),
  // PLAN (15 cols) — all numeric -> string | null
  planInManMonth: z.string().nullable(),
  planOutManMonth: z.string().nullable(),
  planServSaleAmt: z.string().nullable(),
  planProdSaleAmt: z.string().nullable(),
  planInfSaleAmt: z.string().nullable(),
  planServInCostAmt: z.string().nullable(),
  planServOutCostAmt: z.string().nullable(),
  planProdCostAmt: z.string().nullable(),
  planInCostAmt: z.string().nullable(),
  planOutCostAmt: z.string().nullable(),
  planIndirectGrpAmt: z.string().nullable(),
  planIndirectComAmt: z.string().nullable(),
  planRentAmt: z.string().nullable(),
  planSgaAmt: z.string().nullable(),
  planExpAmt: z.string().nullable(),
  // VIEW (15 cols same shape)
  viewInManMonth: z.string().nullable(),
  viewOutManMonth: z.string().nullable(),
  viewServSaleAmt: z.string().nullable(),
  viewProdSaleAmt: z.string().nullable(),
  viewInfSaleAmt: z.string().nullable(),
  viewServInCostAmt: z.string().nullable(),
  viewServOutCostAmt: z.string().nullable(),
  viewProdCostAmt: z.string().nullable(),
  viewInCostAmt: z.string().nullable(),
  viewOutCostAmt: z.string().nullable(),
  viewIndirectGrpAmt: z.string().nullable(),
  viewIndirectComAmt: z.string().nullable(),
  viewRentAmt: z.string().nullable(),
  viewSgaAmt: z.string().nullable(),
  viewExpAmt: z.string().nullable(),
  // PERF (15 cols same shape)
  perfInManMonth: z.string().nullable(),
  perfOutManMonth: z.string().nullable(),
  perfServSaleAmt: z.string().nullable(),
  perfProdSaleAmt: z.string().nullable(),
  perfInfSaleAmt: z.string().nullable(),
  perfServInCostAmt: z.string().nullable(),
  perfServOutCostAmt: z.string().nullable(),
  perfProdCostAmt: z.string().nullable(),
  perfInCostAmt: z.string().nullable(),
  perfOutCostAmt: z.string().nullable(),
  perfIndirectGrpAmt: z.string().nullable(),
  perfIndirectComAmt: z.string().nullable(),
  perfRentAmt: z.string().nullable(),
  perfSgaAmt: z.string().nullable(),
  perfExpAmt: z.string().nullable(),
  // Tax (2 cols)
  taxOrderAmt: z.string().nullable(),
  taxServAmt: z.string().nullable(),
  // Finalize
  rfcEndYn: z.string().nullable(),
  note: z.string().nullable(),
  // audit
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesContractMonthRow = z.infer<typeof salesContractMonthRowSchema>;

export const listContractMonthsInput = z.object({
  q: z.string().optional(),
  contractId: z.string().uuid().optional(),
  ym: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export type ListContractMonthsInput = z.infer<typeof listContractMonthsInput>;

// Build contractId+ym required since they're notNull in schema
const _monthCreateBase = salesContractMonthRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesContractMonthCreateSchema = _monthCreateBase.pick({
  contractId: true,
  ym: true,
}).merge(_monthCreateBase.omit({ contractId: true, ym: true }).partial());

export const salesContractMonthUpdateSchema = _monthCreateBase.partial().extend({ id: z.string().uuid() });

export type SalesContractMonthCreate = z.infer<typeof salesContractMonthCreateSchema>;
export type SalesContractMonthUpdate = z.infer<typeof salesContractMonthUpdateSchema>;

export const saveContractMonthsInput = z.object({
  creates: z.array(salesContractMonthCreateSchema).default([]),
  updates: z.array(salesContractMonthUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SaveContractMonthsInput = z.infer<typeof saveContractMonthsInput>;

/* ============================================================
 * sales_contract_addinfo (TBIZ032)
 * ============================================================ */

export const salesContractAddinfoRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contractId: z.string().uuid(),
  legacyEnterCd: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  legacySabun: z.string().nullable(),
  mailId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesContractAddinfoRow = z.infer<typeof salesContractAddinfoRowSchema>;

// contractId required on create
const _addinfoCols = salesContractAddinfoRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesContractAddinfoCreateSchema = _addinfoCols.pick({ contractId: true })
  .merge(_addinfoCols.omit({ contractId: true }).partial());

export const salesContractAddinfoUpdateSchema = _addinfoCols.partial().extend({ id: z.string().uuid() });

export type SalesContractAddinfoCreate = z.infer<typeof salesContractAddinfoCreateSchema>;
export type SalesContractAddinfoUpdate = z.infer<typeof salesContractAddinfoUpdateSchema>;

export const saveContractAddinfosInput = z.object({
  creates: z.array(salesContractAddinfoCreateSchema).default([]),
  updates: z.array(salesContractAddinfoUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SaveContractAddinfosInput = z.infer<typeof saveContractAddinfosInput>;

/* ============================================================
 * sales_contract_service (TBIZ010)
 * ============================================================ */

export const salesContractServiceRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: z.string().nullable(),
  legacySymd: z.string().nullable(),
  legacyServSabun: z.string().nullable(),
  servSabun: z.string(),
  servName: z.string().nullable(),
  birYmd: z.string().nullable(),
  symd: z.string().nullable(),
  eymd: z.string().nullable(),
  cpyGbCd: z.string().nullable(),
  cpyName: z.string().nullable(),
  econtAmt: z.string().nullable(),
  econtCnt: z.string().nullable(),
  job: z.string().nullable(),
  tel: z.string().nullable(),
  mail: z.string().nullable(),
  addr: z.string().nullable(),
  attendCd: z.string().nullable(),
  skillCd: z.string().nullable(),
  cmmncCd: z.string().nullable(),
  rsponsCd: z.string().nullable(),
  memo1: z.string().nullable(),
  memo2: z.string().nullable(),
  memo3: z.string().nullable(),
  orgCd: z.string().nullable(),
  manager: z.string().nullable(),
  pjtCd: z.string().nullable(),
  pjtNm: z.string().nullable(),
  etc1: z.string().nullable(),
  etc2: z.string().nullable(),
  etc3: z.string().nullable(),
  etc4: z.string().nullable(),
  etc5: z.string().nullable(),
  etc6: z.string().nullable(),
  etc7: z.string().nullable(),
  etc8: z.string().nullable(),
  etc9: z.string().nullable(),
  etc10: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type SalesContractServiceRow = z.infer<typeof salesContractServiceRowSchema>;

export const listContractServicesInput = z.object({
  q: z.string().optional(),
  pjtCd: z.string().optional(),
  attendCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export type ListContractServicesInput = z.infer<typeof listContractServicesInput>;

// servSabun required on create
const _serviceCols = salesContractServiceRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesContractServiceCreateSchema = _serviceCols.pick({ servSabun: true })
  .merge(_serviceCols.omit({ servSabun: true }).partial());

export const salesContractServiceUpdateSchema = _serviceCols.partial().extend({ id: z.string().uuid() });

export type SalesContractServiceCreate = z.infer<typeof salesContractServiceCreateSchema>;
export type SalesContractServiceUpdate = z.infer<typeof salesContractServiceUpdateSchema>;

export const saveContractServicesInput = z.object({
  creates: z.array(salesContractServiceCreateSchema).default([]),
  updates: z.array(salesContractServiceUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export type SaveContractServicesInput = z.infer<typeof saveContractServicesInput>;
