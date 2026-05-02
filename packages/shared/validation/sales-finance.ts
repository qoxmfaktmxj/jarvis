import { z } from "zod";

const auditRow = {
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
};

const pagingInput = {
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
};

export const salesPurchaseRowSchema = z.object({
  ...auditRow,
  legacyEnterCd: z.string().nullable(),
  legacyContYear: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  legacySeq: z.number().int().nullable(),
  legacyPurSeq: z.number().int().nullable(),
  purType: z.string().nullable(),
  sdate: z.string().nullable(),
  edate: z.string().nullable(),
  purNm: z.string().nullable(),
  subAmt: z.string().nullable(),
  amt: z.string().nullable(),
  servSabun: z.string().nullable(),
  servName: z.string().nullable(),
  servBirthday: z.string().nullable(),
  servTelNo: z.string().nullable(),
  servAddr: z.string().nullable(),
  note: z.string().nullable(),
  contNm: z.string().nullable(),
  detail: z.string().nullable(),
});

export type SalesPurchaseRow = z.infer<typeof salesPurchaseRowSchema>;

export const listPurchasesInput = z.object({
  q: z.string().optional(),
  purType: z.string().optional(),
  baseDate: z.string().optional(),
  ...pagingInput,
});

const purchaseWritableSchema = salesPurchaseRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  contNm: true,
  detail: true,
}).partial();

export const salesPurchaseCreateSchema = purchaseWritableSchema;
export const salesPurchaseUpdateSchema = purchaseWritableSchema.extend({ id: z.string().uuid() });
export const savePurchasesInput = z.object({
  creates: z.array(salesPurchaseCreateSchema).default([]),
  updates: z.array(salesPurchaseUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

// --- sales_purchase_project (TBIZ041) — child rows of sales_purchase ----------

export const salesPurchaseProjectRowSchema = z.object({
  ...auditRow,
  purchaseId: z.string().uuid().nullable(),
  legacyEnterCd: z.string().nullable(),
  legacyContYear: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  legacySeq: z.number().int().nullable(),
  legacyPurSeq: z.number().int().nullable(),
  subContNo: z.string().nullable(),
  pjtCode: z.string().nullable(),
  pjtNm: z.string().nullable(),
});

export type SalesPurchaseProjectRow = z.infer<typeof salesPurchaseProjectRowSchema>;

export const listPurchaseProjectsInput = z.object({
  purchaseId: z.string().uuid(),
});

const purchaseProjectWritableSchema = salesPurchaseProjectRowSchema.omit({
  id: true,
  workspaceId: true,
  purchaseId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).partial();

export const salesPurchaseProjectCreateSchema = purchaseProjectWritableSchema;
export const salesPurchaseProjectUpdateSchema = purchaseProjectWritableSchema.extend({
  id: z.string().uuid(),
});
export const savePurchaseProjectsInput = z.object({
  purchaseId: z.string().uuid(),
  creates: z.array(salesPurchaseProjectCreateSchema).default([]),
  updates: z.array(salesPurchaseProjectUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const salesTaxBillRowSchema = z.object({
  ...auditRow,
  legacyEnterCd: z.string().nullable(),
  legacyContNo: z.string().nullable(),
  legacySeq: z.number().int().nullable(),
  ym: z.string().nullable(),
  orderDivCd: z.string().nullable(),
  costCd: z.string().nullable(),
  pjtNm: z.string().nullable(),
  pjtCode: z.string().nullable(),
  purSeq: z.string().nullable(),
  debitCreditCd: z.string().nullable(),
  slipTargetYn: z.string().nullable(),
  billType: z.string().nullable(),
  slipSeq: z.string().nullable(),
  transCode: z.string().nullable(),
  docDate: z.string().nullable(),
  slipType: z.string().nullable(),
  compCd: z.string().nullable(),
  postDate: z.string().nullable(),
  currencyType: z.string().nullable(),
  referSlipNo: z.string().nullable(),
  postKey: z.string().nullable(),
  accountType: z.string().nullable(),
  businessArea: z.string().nullable(),
  amt: z.string().nullable(),
  vatAmt: z.string().nullable(),
  briefsTxt: z.string().nullable(),
  slipResultYn: z.string().nullable(),
  servSabun: z.string().nullable(),
  servName: z.string().nullable(),
  servBirthday: z.string().nullable(),
  servTelNo: z.string().nullable(),
  servAddr: z.string().nullable(),
  taxCode: z.string().nullable(),
  businessLocation: z.string().nullable(),
  companyNm: z.string().nullable(),
  receiptCd: z.string().nullable(),
  contNm: z.string().nullable(),
  receiptNo: z.string().nullable(),
});

export type SalesTaxBillRow = z.infer<typeof salesTaxBillRowSchema>;

export const listTaxBillsInput = z.object({
  q: z.string().optional(),
  billType: z.string().optional(),
  ym: z.string().optional(),
  fromYmd: z.string().optional(),
  toYmd: z.string().optional(),
  ...pagingInput,
});

const taxBillWritableSchema = salesTaxBillRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  contNm: true,
  receiptNo: true,
}).partial();

export const salesTaxBillCreateSchema = taxBillWritableSchema;
export const salesTaxBillUpdateSchema = taxBillWritableSchema.extend({ id: z.string().uuid() });
export const saveTaxBillsInput = z.object({
  creates: z.array(salesTaxBillCreateSchema).default([]),
  updates: z.array(salesTaxBillUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const salesMonthExpSgaRowSchema = z.object({
  ...auditRow,
  legacyEnterCd: z.string().nullable(),
  yyyy: z.string().nullable(),
  mm: z.string().nullable(),
  costCd: z.string().nullable(),
  expAmt: z.string().nullable(),
  sgaAmt: z.string().nullable(),
  waers: z.string().nullable(),
});

export type SalesMonthExpSgaRow = z.infer<typeof salesMonthExpSgaRowSchema>;

export const listMonthExpSgaInput = z.object({
  ym: z.string().optional(),
  costCd: z.string().optional(),
  ...pagingInput,
});

const monthExpSgaWritableSchema = salesMonthExpSgaRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).partial();

export const salesMonthExpSgaCreateSchema = monthExpSgaWritableSchema;
export const salesMonthExpSgaUpdateSchema = monthExpSgaWritableSchema.extend({ id: z.string().uuid() });
export const saveMonthExpSgaInput = z.object({
  creates: z.array(salesMonthExpSgaCreateSchema).default([]),
  updates: z.array(salesMonthExpSgaUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const salesPlanDivCostRowSchema = z.object({
  ...auditRow,
  legacyEnterCd: z.string().nullable(),
  costCd: z.string().nullable(),
  accountType: z.string().nullable(),
  ym: z.string().nullable(),
  planAmt: z.string().nullable(),
  prdtAmt: z.string().nullable(),
  performAmt: z.string().nullable(),
  note: z.string().nullable(),
  costNm: z.string().nullable(),
});

export type SalesPlanDivCostRow = z.infer<typeof salesPlanDivCostRowSchema>;

export const listPlanDivCostsInput = z.object({
  q: z.string().optional(),
  accountType: z.string().optional(),
  year: z.string().optional(),
  ...pagingInput,
});

const planDivCostWritableSchema = salesPlanDivCostRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  costNm: true,
}).partial();

export const salesPlanDivCostCreateSchema = planDivCostWritableSchema;
export const salesPlanDivCostUpdateSchema = planDivCostWritableSchema.extend({ id: z.string().uuid() });
export const savePlanDivCostsInput = z.object({
  creates: z.array(salesPlanDivCostCreateSchema).default([]),
  updates: z.array(salesPlanDivCostUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

// --- sales_plan_div_cost_detail (TBIZ028) — rate breakdown sub-rows ----------

export const salesPlanDivCostDetailRowSchema = z.object({
  ...auditRow,
  planDivCostId: z.string().uuid().nullable(),
  legacyEnterCd: z.string().nullable(),
  costCd: z.string().nullable(),
  accountType: z.string().nullable(),
  ym: z.string().nullable(),
  subCostCd: z.string().nullable(),
  planRate: z.string().nullable(),
  prdtRate: z.string().nullable(),
  performRate: z.string().nullable(),
  useYn: z.string().nullable(),
});

export type SalesPlanDivCostDetailRow = z.infer<typeof salesPlanDivCostDetailRowSchema>;

export const listPlanDivCostDetailsInput = z.object({
  planDivCostId: z.string().uuid(),
});

const planDivCostDetailWritableSchema = salesPlanDivCostDetailRowSchema.omit({
  id: true,
  workspaceId: true,
  planDivCostId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).partial();

export const salesPlanDivCostDetailCreateSchema = planDivCostDetailWritableSchema;
export const salesPlanDivCostDetailUpdateSchema = planDivCostDetailWritableSchema.extend({
  id: z.string().uuid(),
});
export const savePlanDivCostDetailsInput = z.object({
  planDivCostId: z.string().uuid(),
  creates: z.array(salesPlanDivCostDetailCreateSchema).default([]),
  updates: z.array(salesPlanDivCostDetailUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});
