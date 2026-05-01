import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const salesCloudPeopleBase = pgTable(
  "sales_cloud_people_base",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    contNo: varchar("cont_no", { length: 30 }).notNull(),
    contYear: varchar("cont_year", { length: 4 }).notNull(),
    seq: integer("seq").notNull(),
    pjtCode: varchar("pjt_code", { length: 20 }),
    companyCd: varchar("company_cd", { length: 10 }),
    personType: varchar("person_type", { length: 10 }).notNull(),
    calcType: varchar("calc_type", { length: 10 }).notNull(),
    sdate: varchar("sdate", { length: 8 }).notNull(),
    edate: varchar("edate", { length: 8 }),
    monthAmt: numeric("month_amt"),
    note: varchar("note", { length: 4000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_cloud_people_base_ws_idx").on(t.workspaceId),
    wsContractIdx: index("sales_cloud_people_base_ws_contract_idx").on(
      t.workspaceId,
      t.contYear,
      t.contNo,
    ),
    wsPjtIdx: index("sales_cloud_people_base_ws_pjt_idx").on(t.workspaceId, t.pjtCode),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard is effective only after ETL populates
    // legacy_enter_cd. Pre-ETL rows with NULL legacy keys bypass dedup.
    legacyUniq: uniqueIndex("sales_cloud_people_base_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.contNo,
      t.contYear,
      t.seq,
      t.personType,
      t.calcType,
      t.sdate,
    ),
  }),
);

export const salesCloudPeopleCalc = pgTable(
  "sales_cloud_people_calc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    contNo: varchar("cont_no", { length: 30 }).notNull(),
    contYear: varchar("cont_year", { length: 4 }).notNull(),
    seq: integer("seq").notNull(),
    personType: varchar("person_type", { length: 10 }).notNull(),
    calcType: varchar("calc_type", { length: 10 }).notNull(),
    ym: varchar("ym", { length: 6 }).notNull(),
    personCnt: integer("person_cnt"),
    totalAmt: numeric("total_amt"),
    note: varchar("note", { length: 4000 }),
    reflYn: varchar("refl_yn", { length: 1 }),
    reflId: varchar("refl_id", { length: 20 }),
    reflDate: timestamp("refl_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_cloud_people_calc_ws_idx").on(t.workspaceId),
    wsContractYmIdx: index("sales_cloud_people_calc_ws_contract_ym_idx").on(
      t.workspaceId,
      t.contYear,
      t.contNo,
      t.ym,
    ),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard is effective only after ETL populates
    // legacy_enter_cd. Pre-ETL rows with NULL legacy keys bypass dedup.
    legacyUniq: uniqueIndex("sales_cloud_people_calc_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.contNo,
      t.contYear,
      t.seq,
      t.personType,
      t.calcType,
      t.ym,
    ),
  }),
);

