import {
  bigint, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

export const salesPlanPerf = pgTable(
  "sales_plan_perf",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    ym: varchar("ym", { length: 6 }).notNull(),
    orgCd: varchar("org_cd", { length: 20 }).notNull(),
    orgNm: varchar("org_nm", { length: 100 }).notNull(),
    gubunCd: varchar("gubun_cd", { length: 10 }).notNull(),
    trendGbCd: varchar("trend_gb_cd", { length: 10 }).notNull(),
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
