import {
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const salesFreelancer = pgTable(
  "sales_freelancer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    sabun: varchar("sabun", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }),
    resNo: varchar("res_no", { length: 13 }),
    pjtCd: varchar("pjt_cd", { length: 20 }),
    pjtNm: varchar("pjt_nm", { length: 300 }),
    sdate: varchar("sdate", { length: 8 }),
    edate: varchar("edate", { length: 8 }),
    addr: varchar("addr", { length: 400 }),
    tel: varchar("tel", { length: 20 }),
    mailId: varchar("mail_id", { length: 50 }),
    belongYm: varchar("belong_ym", { length: 6 }).notNull(),
    businessCd: varchar("business_cd", { length: 20 }).notNull(),
    totMon: numeric("tot_mon"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_freelancer_ws_idx").on(t.workspaceId),
    wsBelongYmIdx: index("sales_freelancer_ws_belong_ym_idx").on(t.workspaceId, t.belongYm),
    wsSabunIdx: index("sales_freelancer_ws_sabun_idx").on(t.workspaceId, t.sabun),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard is effective only after ETL populates
    // legacy_enter_cd. Pre-ETL rows with NULL legacy keys bypass dedup.
    legacyUniq: uniqueIndex("sales_freelancer_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.sabun,
      t.belongYm,
      t.businessCd,
    ),
  }),
);

