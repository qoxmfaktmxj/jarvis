import { z } from "zod";

const nullableText = z.string().nullable();
const nullableNumeric = z.string().nullable();

const auditColumns = {
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
};

export const salesContractUploadRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: nullableText,
  ym: z.string().min(1).max(6),
  inOutType: nullableText,
  costCd: z.string().min(1).max(20),
  costGrpNm: nullableText,
  costNm: nullableText,
  productType: z.string().min(1).max(20),
  contType: z.string().min(1).max(20),
  companyCd: z.string().min(1).max(50),
  companyNm: nullableText,
  pjtCode: z.string().min(1).max(50),
  pjtNm: nullableText,
  sucProb: nullableText,
  planServSaleAmt: nullableNumeric,
  planProdSaleAmt: nullableNumeric,
  planInfSaleAmt: nullableNumeric,
  planServOutCostAmt: nullableNumeric,
  planProdCostAmt: nullableNumeric,
  planRentAmt: nullableNumeric,
  planExpAmt: nullableNumeric,
  planSgaAmt: nullableNumeric,
  planInCostAmt: nullableNumeric,
  planOutCostAmt: nullableNumeric,
  planIndirectGrpAmt: nullableNumeric,
  planIndirectComAmt: nullableNumeric,
  planInManMonth: nullableNumeric,
  planOutManMonth: nullableNumeric,
  viewServSaleAmt: nullableNumeric,
  viewProdSaleAmt: nullableNumeric,
  viewInfSaleAmt: nullableNumeric,
  viewServOutCostAmt: nullableNumeric,
  viewProdCostAmt: nullableNumeric,
  viewRentAmt: nullableNumeric,
  viewExpAmt: nullableNumeric,
  viewSgaAmt: nullableNumeric,
  viewInCostAmt: nullableNumeric,
  viewOutCostAmt: nullableNumeric,
  viewIndirectGrpAmt: nullableNumeric,
  viewIndirectComAmt: nullableNumeric,
  viewInManMonth: nullableNumeric,
  viewOutManMonth: nullableNumeric,
  perfServSaleAmt: nullableNumeric,
  perfProdSaleAmt: nullableNumeric,
  perfInfSaleAmt: nullableNumeric,
  perfServOutCostAmt: nullableNumeric,
  perfProdCostAmt: nullableNumeric,
  perfRentAmt: nullableNumeric,
  perfExpAmt: nullableNumeric,
  perfSgaAmt: nullableNumeric,
  perfInCostAmt: nullableNumeric,
  perfOutCostAmt: nullableNumeric,
  perfIndirectGrpAmt: nullableNumeric,
  perfIndirectComAmt: nullableNumeric,
  perfInManMonth: nullableNumeric,
  perfOutManMonth: nullableNumeric,
  note: nullableText,
  ...auditColumns,
});

export type SalesContractUploadRow = z.infer<typeof salesContractUploadRowSchema>;

export const listContractUploadsInput = z.object({
  q: z.string().optional(),
  ym: z.string().optional(),
  companyCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

const contractUploadCreateBase = salesContractUploadRowSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesContractUploadCreateSchema = contractUploadCreateBase
  .pick({
    ym: true,
    costCd: true,
    productType: true,
    contType: true,
    companyCd: true,
    pjtCode: true,
  })
  .merge(
    contractUploadCreateBase
      .omit({
        ym: true,
        costCd: true,
        productType: true,
        contType: true,
        companyCd: true,
        pjtCode: true,
      })
      .partial(),
  );

export const salesContractUploadUpdateSchema = contractUploadCreateBase
  .partial()
  .extend({ id: z.string().uuid() });

export const saveContractUploadsInput = z.object({
  creates: z.array(salesContractUploadCreateSchema).default([]),
  updates: z.array(salesContractUploadUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const unifiedContractUploadRowSchema = z.object({
  id: z.string(),
  sourceTable: z.enum(["031", "037"]),
  ym: z.string(),
  companyCd: nullableText,
  companyNm: nullableText,
  pjtCode: nullableText,
  pjtNm: nullableText,
  planServSaleAmt: nullableNumeric,
  viewServSaleAmt: nullableNumeric,
  perfServSaleAmt: nullableNumeric,
});

export type UnifiedContractUploadRow = z.infer<typeof unifiedContractUploadRowSchema>;

export const salesPlanViewPerformanceRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyEnterCd: nullableText,
  dataType: z.string().min(1).max(20),
  companyCd: z.string().min(1).max(50),
  costCd: z.string().min(1).max(20),
  pjtCode: z.string().min(1).max(50),
  contYear: z.string().min(1).max(4),
  pjtNm: nullableText,
  companyNo: nullableText,
  companyNm: nullableText,
  companyType: nullableText,
  inOutType: nullableText,
  title: nullableText,
  custNm: nullableText,
  contGbCd: nullableText,
  contYmd: nullableText,
  contSymd: nullableText,
  contEymd: nullableText,
  newYn: nullableText,
  contType: nullableText,
  productType: nullableText,
  totOrderAmt: nullableNumeric,
  serOrderAmt: nullableNumeric,
  prdOrderAmt: nullableNumeric,
  infOrderAmt: nullableNumeric,
  servAmt: nullableNumeric,
  prodAmt: nullableNumeric,
  inManMonth: nullableNumeric,
  outManMonth: nullableNumeric,
  sgaAmt: nullableNumeric,
  expAmt: nullableNumeric,
  changeReason: nullableText,
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  ...auditColumns,
});

export type SalesPlanViewPerformanceRow = z.infer<typeof salesPlanViewPerformanceRowSchema>;

export const listPlanViewPermissionsInput = z.object({
  q: z.string().optional(),
  contYear: z.string().optional(),
  companyCd: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

const planViewCreateBase = salesPlanViewPerformanceRowSchema.omit({
  id: true,
  workspaceId: true,
  canRead: true,
  canWrite: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const salesPlanViewPerformanceCreateSchema = planViewCreateBase
  .pick({
    dataType: true,
    companyCd: true,
    costCd: true,
    pjtCode: true,
    contYear: true,
  })
  .merge(
    planViewCreateBase
      .omit({
        dataType: true,
        companyCd: true,
        costCd: true,
        pjtCode: true,
        contYear: true,
      })
      .partial(),
  );

export const salesPlanViewPerformanceUpdateSchema = planViewCreateBase
  .partial()
  .extend({ id: z.string().uuid() });

export const savePlanViewPermissionsInput = z.object({
  creates: z.array(salesPlanViewPerformanceCreateSchema).default([]),
  updates: z.array(salesPlanViewPerformanceUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const savePlanAclInput = z.object({
  planId: z.string().uuid(),
  userId: z.string().uuid(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
});

export type ListContractUploadsInput = z.infer<typeof listContractUploadsInput>;
export type SaveContractUploadsInput = z.infer<typeof saveContractUploadsInput>;
export type ListPlanViewPermissionsInput = z.infer<typeof listPlanViewPermissionsInput>;
export type SavePlanViewPermissionsInput = z.infer<typeof savePlanViewPermissionsInput>;
export type SavePlanAclInput = z.infer<typeof savePlanAclInput>;
