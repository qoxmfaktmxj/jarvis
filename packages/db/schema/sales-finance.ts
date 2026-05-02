/**
 * packages/db/schema/sales-finance.ts
 *
 * Sales contract finance settlement tables.
 *
 * Legacy sources:
 * - TBIZ040/TBIZ041: purchase management + purchase project detail
 * - TBIZ046: tax bill document management
 * - TBIZ038: monthly expense and SGA
 * - TBIZ027/TBIZ028: planned division costs + detail rates
 */

import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const salesPurchase = pgTable(
  "sales_purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacyContYear: varchar("legacy_cont_year", { length: 4 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),
    legacySeq: integer("legacy_seq"),
    legacyPurSeq: integer("legacy_pur_seq"),

    purType: varchar("pur_type", { length: 10 }),
    sdate: varchar("sdate", { length: 8 }),
    edate: varchar("edate", { length: 8 }),
    purNm: varchar("pur_nm", { length: 200 }),
    subAmt: numeric("sub_amt"),
    amt: numeric("amt"),
    servSabun: varchar("serv_sabun", { length: 20 }),
    servName: varchar("serv_name", { length: 200 }),
    servBirthday: varchar("serv_birthday", { length: 8 }),
    servTelNo: varchar("serv_tel_no", { length: 50 }),
    servAddr: varchar("serv_addr", { length: 400 }),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_purchase_ws_idx").on(t.workspaceId),
    wsDateIdx: index("sales_purchase_ws_date_idx").on(t.workspaceId, t.sdate, t.edate),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard becomes strict only after ETL fills all
    // legacy key columns; pre-ETL manual rows with NULL keys bypass dedup.
    legacyUniq: uniqueIndex("sales_purchase_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.legacyContYear,
      t.legacyContNo,
      t.legacySeq,
      t.legacyPurSeq,
    ),
  }),
);

export const salesPurchaseProject = pgTable(
  "sales_purchase_project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    purchaseId: uuid("purchase_id").references(() => salesPurchase.id, { onDelete: "cascade" }),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacyContYear: varchar("legacy_cont_year", { length: 4 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),
    legacySeq: integer("legacy_seq"),
    legacyPurSeq: integer("legacy_pur_seq"),
    subContNo: varchar("sub_cont_no", { length: 20 }),
    pjtCode: varchar("pjt_code", { length: 20 }),
    pjtNm: varchar("pjt_nm", { length: 300 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_purchase_project_ws_idx").on(t.workspaceId),
    purchaseIdx: index("sales_purchase_project_purchase_idx").on(t.purchaseId),
    // NOTE: nullable legacy key columns can bypass uniqueness until ETL fills
    // the complete TBIZ041 composite key.
    legacyUniq: uniqueIndex("sales_purchase_project_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.legacyContYear,
      t.legacyContNo,
      t.legacySeq,
      t.legacyPurSeq,
      t.subContNo,
      t.pjtCode,
    ),
  }),
);

export const salesTaxBill = pgTable(
  "sales_tax_bill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),
    legacySeq: integer("legacy_seq"),
    ym: varchar("ym", { length: 6 }),
    orderDivCd: varchar("order_div_cd", { length: 10 }),

    costCd: varchar("cost_cd", { length: 30 }),
    pjtNm: varchar("pjt_nm", { length: 300 }),
    pjtCode: varchar("pjt_code", { length: 30 }),
    purSeq: varchar("pur_seq", { length: 30 }),
    debitCreditCd: varchar("debit_credit_cd", { length: 10 }),
    slipTargetYn: varchar("slip_target_yn", { length: 1 }),
    billType: varchar("bill_type", { length: 10 }),
    slipSeq: varchar("slip_seq", { length: 2 }),
    transCode: varchar("trans_code", { length: 10 }),
    docDate: varchar("doc_date", { length: 8 }),
    slipType: varchar("slip_type", { length: 10 }),
    compCd: varchar("comp_cd", { length: 10 }),
    postDate: varchar("post_date", { length: 8 }),
    currencyType: varchar("currency_type", { length: 10 }),
    referSlipNo: varchar("refer_slip_no", { length: 20 }),
    postKey: varchar("post_key", { length: 10 }),
    accountType: varchar("account_type", { length: 30 }),
    businessArea: varchar("business_area", { length: 10 }),
    amt: numeric("amt"),
    vatAmt: numeric("vat_amt"),
    briefsTxt: text("briefs_txt"),
    slipResultYn: varchar("slip_result_yn", { length: 1 }),
    servSabun: varchar("serv_sabun", { length: 20 }),
    servName: varchar("serv_name", { length: 200 }),
    servBirthday: varchar("serv_birthday", { length: 8 }),
    servTelNo: varchar("serv_tel_no", { length: 50 }),
    servAddr: varchar("serv_addr", { length: 400 }),
    taxCode: varchar("tax_code", { length: 20 }),
    businessLocation: varchar("business_location", { length: 20 }),
    companyNm: varchar("company_nm", { length: 300 }),
    receiptCd: varchar("receipt_cd", { length: 10 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_tax_bill_ws_idx").on(t.workspaceId),
    wsYmIdx: index("sales_tax_bill_ws_ym_idx").on(t.workspaceId, t.ym),
    wsPostDateIdx: index("sales_tax_bill_ws_post_date_idx").on(t.workspaceId, t.postDate),
    // NOTE: nullable legacy key columns can bypass uniqueness until ETL fills
    // the complete TBIZ046 composite key.
    legacyUniq: uniqueIndex("sales_tax_bill_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.legacyContNo,
      t.legacySeq,
      t.ym,
      t.orderDivCd,
    ),
  }),
);

export const salesMonthExpSga = pgTable(
  "sales_month_exp_sga",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    yyyy: varchar("yyyy", { length: 4 }),
    mm: varchar("mm", { length: 2 }),
    costCd: varchar("cost_cd", { length: 10 }),
    expAmt: numeric("exp_amt"),
    sgaAmt: numeric("sga_amt"),
    waers: varchar("waers", { length: 20 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_month_exp_sga_ws_idx").on(t.workspaceId),
    wsYmIdx: index("sales_month_exp_sga_ws_ym_idx").on(t.workspaceId, t.yyyy, t.mm),
    // NOTE: nullable legacy key columns can bypass uniqueness until ETL fills
    // the complete TBIZ038 composite key.
    legacyUniq: uniqueIndex("sales_month_exp_sga_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.yyyy,
      t.mm,
      t.costCd,
    ),
  }),
);

export const salesPlanDivCost = pgTable(
  "sales_plan_div_cost",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    costCd: varchar("cost_cd", { length: 50 }),
    accountType: varchar("account_type", { length: 10 }),
    ym: varchar("ym", { length: 6 }),
    planAmt: numeric("plan_amt"),
    prdtAmt: numeric("prdt_amt"),
    performAmt: numeric("perform_amt"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_plan_div_cost_ws_idx").on(t.workspaceId),
    wsYmIdx: index("sales_plan_div_cost_ws_ym_idx").on(t.workspaceId, t.ym),
    // NOTE: nullable legacy key columns can bypass uniqueness until ETL fills
    // the complete TBIZ027 composite key.
    legacyUniq: uniqueIndex("sales_plan_div_cost_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.costCd,
      t.accountType,
      t.ym,
    ),
  }),
);

export const salesPlanDivCostDetail = pgTable(
  "sales_plan_div_cost_detail",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    planDivCostId: uuid("plan_div_cost_id").references(() => salesPlanDivCost.id, { onDelete: "cascade" }),

    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    costCd: varchar("cost_cd", { length: 50 }),
    accountType: varchar("account_type", { length: 10 }),
    ym: varchar("ym", { length: 6 }),
    subCostCd: varchar("sub_cost_cd", { length: 50 }),
    planRate: numeric("plan_rate"),
    prdtRate: numeric("prdt_rate"),
    performRate: numeric("perform_rate"),
    useYn: varchar("use_yn", { length: 1 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_plan_div_cost_detail_ws_idx").on(t.workspaceId),
    planIdx: index("sales_plan_div_cost_detail_plan_idx").on(t.planDivCostId),
    // NOTE: nullable legacy key columns can bypass uniqueness until ETL fills
    // the complete TBIZ028 composite key.
    legacyUniq: uniqueIndex("sales_plan_div_cost_detail_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.costCd,
      t.accountType,
      t.ym,
      t.subCostCd,
    ),
  }),
);
