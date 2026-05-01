/**
 * packages/db/schema/sales-product-type.ts
 *
 * 영업관리 제품군 관련 테이블 (TBIZ024~TBIZ025).
 *
 * - salesProductType (TBIZ024): 제품 유형 마스터
 * - salesCostMaster  (TBIZ025): 코스트 마스터 (P3 분배원가 도메인 연계 예정)
 * - salesProductTypeCost: 제품 × 코스트 매핑 (TBIZ024 row mapping; period-aware)
 *
 * Phase-Sales P1.5 Task 2 (2026-05-01):
 *  P1은 (제품 × 코스트 × 기간) row 매핑을 sales_product_type.cost_mapping_json
 *  단일 jsonb 컬럼에 collapse 했지만, FK CASCADE / 인덱스 조회를 잃기 때문에
 *  master + cost_master(reused) + product_type_cost(new) 3 테이블 정규화로 복원.
 */
import {
  boolean,
  date,
  index,
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

export const salesProductTypeCost = pgTable(
  "sales_product_type_cost",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    productTypeId: uuid("product_type_id")
      .notNull()
      .references(() => salesProductType.id, { onDelete: "cascade" }),
    costId: uuid("cost_id")
      .notNull()
      .references(() => salesCostMaster.id, { onDelete: "cascade" }),
    legacyProductTypeCd: text("legacy_product_type_cd"),
    legacyCostCd: text("legacy_cost_cd"),
    sdate: date("sdate").notNull(),
    edate: date("edate"),
    bizYn: boolean("biz_yn").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsProductCostSdateUniq: uniqueIndex(
      "sales_product_type_cost_ws_pid_cid_sdate_uniq",
    ).on(t.workspaceId, t.productTypeId, t.costId, t.sdate),
    wsProductIdx: index("sales_product_type_cost_ws_pid_idx").on(
      t.workspaceId,
      t.productTypeId,
    ),
  }),
);
