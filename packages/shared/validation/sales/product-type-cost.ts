import { z } from "zod";

export const productCostInput = z.object({
  productTypeId: z.string().uuid(),
  costId: z.string().uuid(),
  sdate: z.string().date(),
  edate: z.string().date().nullable(),
  bizYn: z.boolean(),
  note: z.string().nullable(),
});

export const productCostOutput = productCostInput.extend({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  legacyProductTypeCd: z.string().nullable(),
  legacyCostCd: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.string().uuid().nullable(),
});

export type ProductCostInput = z.infer<typeof productCostInput>;
export type ProductCostOutput = z.infer<typeof productCostOutput>;
