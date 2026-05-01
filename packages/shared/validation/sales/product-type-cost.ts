/**
 * packages/shared/validation/sales/product-type-cost.ts
 *
 * 영업 제품군 × 코스트 매핑 (sales_product_type_cost / TBIZ024 row mapping) Zod 스키마.
 *
 * Phase-Sales P1.5 Task 6 (2026-05-01):
 *  Task 2에서 정규화된 product × cost × period 매핑 테이블의 입출력 스키마를
 *  list/save 컨벤션(다른 sales_* / infra_* 라우트와 동형)으로 확장한다.
 *
 *  - productCostInput / productCostOutput : 단일 row(저장 페이로드 / DB 행)
 *  - listProductCostMappingInput / Output : 그리드 read (productNm/costNm join 포함)
 *  - saveProductCostMappingInput / Output : creates/updates/deletes batch
 */
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

// ---------------------------------------------------------------------------
// Grid row (list output) — joins product_nm + cost_nm for display.
//
// id required for grid identity; productTypeId/costId/sdate are the natural
// uniqueness key; bizYn NOT NULL; note/edate nullable; productTypeNm/costNm
// are read-only join projections (must NOT be sent back on save).
// ---------------------------------------------------------------------------
export const productCostMappingRow = z.object({
  id: z.string().uuid(),
  productTypeId: z.string().uuid(),
  costId: z.string().uuid(),
  productTypeNm: z.string().nullable(),
  costNm: z.string().nullable(),
  legacyProductTypeCd: z.string().nullable(),
  legacyCostCd: z.string().nullable(),
  sdate: z.string().min(1), // ISO yyyy-MM-dd
  edate: z.string().nullable(),
  bizYn: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  updatedBy: z.string().uuid().nullable().optional(),
});

export const listProductCostMappingInput = z.object({
  q: z.string().optional(),
  productTypeId: z.string().uuid().optional(),
  costId: z.string().uuid().optional(),
  /** "active on this date" filter: sdate <= searchYmd AND (edate >= searchYmd OR edate IS NULL) */
  searchYmd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** ILIKE filter on joined costNm */
  searchCostNm: z.string().trim().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

// Export filter input — same fields as list but without pagination
export const exportProductCostMappingInput = z.object({
  q: z.string().optional(),
  productTypeId: z.string().uuid().optional(),
  costId: z.string().uuid().optional(),
  searchYmd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  searchCostNm: z.string().trim().optional(),
});

export type ExportProductCostMappingInput = z.infer<typeof exportProductCostMappingInput>;

export const listProductCostMappingOutput = z.object({
  rows: z.array(productCostMappingRow),
  total: z.number().int().min(0),
});

// Save uses a "writeable" projection of the row — id + productTypeId + costId +
// sdate + edate + bizYn + note. productTypeNm/costNm/legacy*/audit fields are
// stripped server-side, but accept the full row shape so the grid can pass
// rows untouched and TS does not have to fork its types.
export const productCostMappingWriteRow = productCostMappingRow.partial({
  productTypeNm: true,
  costNm: true,
  legacyProductTypeCd: true,
  legacyCostCd: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const saveProductCostMappingInput = z.object({
  creates: z.array(productCostMappingWriteRow).default([]),
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        patch: productCostMappingWriteRow.partial(),
      }),
    )
    .default([]),
  deletes: z.array(z.string().uuid()).default([]),
});

export const saveProductCostMappingOutput = z.object({
  ok: z.boolean(),
  created: z.array(z.string().uuid()).optional(),
  updated: z.array(z.string().uuid()).optional(),
  deleted: z.array(z.string().uuid()).optional(),
  errors: z.array(z.object({ id: z.string().optional(), message: z.string() })).optional(),
});

export type ProductCostMappingRow = z.infer<typeof productCostMappingRow>;
export type ListProductCostMappingInput = z.infer<typeof listProductCostMappingInput>;
export type ListProductCostMappingOutput = z.infer<typeof listProductCostMappingOutput>;
export type SaveProductCostMappingInput = z.infer<typeof saveProductCostMappingInput>;
export type SaveProductCostMappingOutput = z.infer<typeof saveProductCostMappingOutput>;
