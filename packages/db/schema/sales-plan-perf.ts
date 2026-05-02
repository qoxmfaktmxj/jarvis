import {
  bigint, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

/**
 * sales_plan_perf — 영업 계획/실적/전망 시계열 (TBIZ 차트 raw data).
 *
 * Group 6 read-only chart screens (admin-perf / plan-perf / trend) 의 단일 source.
 * (gubun_cd, trend_gb_cd) 조합:
 *   - gubun_cd: B30010 (PLAN | PERF | VIEW)  계획/실적/실적전망 구분
 *   - trend_gb_cd: B30030 (SALES | GROSS_PROFIT | OP_INCOME)  값 구분
 * 데이터 입력은 별도 PR (chartUpload Excel-upload follow-up) 에서 처리.
 */
export const salesPlanPerf = pgTable(
  "sales_plan_perf",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    ym: varchar("ym", { length: 6 }).notNull(),
    orgCd: varchar("org_cd", { length: 20 }).notNull(),
    orgNm: varchar("org_nm", { length: 100 }).notNull(),
    gubunCd: varchar("gubun_cd", { length: 10 }).notNull(),
    trendGbCd: varchar("trend_gb_cd", { length: 20 }).notNull(),
    amt: bigint("amt", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("sales_plan_perf_uniq").on(
      t.workspaceId, t.ym, t.orgCd, t.gubunCd, t.trendGbCd,
    ),
    ymIdx: index("sales_plan_perf_ym_idx").on(t.workspaceId, t.ym),
    orgIdx: index("sales_plan_perf_org_idx").on(t.workspaceId, t.orgCd),
  }),
);

export type SalesPlanPerf = typeof salesPlanPerf.$inferSelect;
export type NewSalesPlanPerf = typeof salesPlanPerf.$inferInsert;
