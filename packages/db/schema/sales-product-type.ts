/**
 * packages/db/schema/sales-product-type.ts
 *
 * 영업관리 제품군 관련 테이블 (TBIZ024~TBIZ025).
 *
 * - salesProductType (TBIZ024): 제품 유형 마스터
 * - salesCostMaster  (TBIZ025): 코스트 마스터 (P3 분배원가 도메인 연계 예정)
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const salesProductType = pgTable(
  "sales_product_type",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    productCd: text("product_cd").notNull(),
    productNm: text("product_nm").notNull(),
    costMappingJson: jsonb("cost_mapping_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("sales_product_type_uniq").on(t.workspaceId, t.productCd),
    wsIdx: index("sales_product_type_ws_idx").on(t.workspaceId),
  }),
);

export const salesCostMaster = pgTable(
  "sales_cost_master",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    costCd: text("cost_cd").notNull(),
    costNm: text("cost_nm").notNull(),
    costGroup: text("cost_group"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("sales_cost_master_uniq").on(t.workspaceId, t.costCd),
    wsIdx: index("sales_cost_master_ws_idx").on(t.workspaceId),
  }),
);
