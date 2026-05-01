/**
 * packages/db/schema/sales-contract.ts
 *
 * 영업관리 계약 관련 테이블 (TBIZ030~TBIZ032, TBIZ010).
 *
 * - salesContract       (TBIZ030): 계약 마스터 (65 컬럼 nullable wide-table)
 * - salesContractMonth  (TBIZ031): 계약 월별 (planning/view/performance 3-way 데이터)
 * - salesContractService (TBIZ032): 계약 서비스 (3 컬럼 lightweight)
 * - salesContractAddinfo (TBIZ010 병합): 계약 추가정보
 */

import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const salesContract = pgTable(
  "sales_contract",
  {
    // PK + workspace
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    // Legacy composite key preservation (재마이그레이션 가능)
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacyContYear: varchar("legacy_cont_year", { length: 4 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),

    // 회사/거래처 (1차 text 필드, FK 미결합)
    companyType: varchar("company_type", { length: 10 }),
    companyCd: varchar("company_cd", { length: 10 }),
    companyGrpNm: varchar("company_grp_nm", { length: 200 }),
    companyNm: varchar("company_nm", { length: 200 }),
    companyNo: varchar("company_no", { length: 40 }),
    customerNo: varchar("customer_no", { length: 20 }),
    customerEmail: varchar("customer_email", { length: 400 }),
    custNm: varchar("cust_nm", { length: 200 }),

    // 계약 기본
    contNm: varchar("cont_nm", { length: 200 }),
    contGbCd: varchar("cont_gb_cd", { length: 10 }),
    contYmd: varchar("cont_ymd", { length: 8 }),
    contSymd: varchar("cont_symd", { length: 8 }),
    contEymd: varchar("cont_eymd", { length: 8 }),
    mainContType: varchar("main_cont_type", { length: 10 }),
    newYn: varchar("new_yn", { length: 1 }),
    inOutType: varchar("in_out_type", { length: 10 }),

    // 계약 금액 (착수금)
    startAmt: numeric("start_amt"),
    startAmtRate: numeric("start_amt_rate", { precision: 5, scale: 2 }),

    // 계약 금액 (중도금 1~5)
    interimAmt1: numeric("interim_amt_1"),
    interimAmtRate1: numeric("interim_amt_rate_1", { precision: 5, scale: 2 }),
    interimAmt2: numeric("interim_amt_2"),
    interimAmtRate2: numeric("interim_amt_rate_2", { precision: 5, scale: 2 }),
    interimAmt3: numeric("interim_amt_3"),
    interimAmtRate3: numeric("interim_amt_rate_3", { precision: 5, scale: 2 }),
    interimAmt4: numeric("interim_amt_4"),
    interimAmtRate4: numeric("interim_amt_rate_4", { precision: 5, scale: 2 }),
    interimAmt5: numeric("interim_amt_5"),
    interimAmtRate5: numeric("interim_amt_rate_5", { precision: 5, scale: 2 }),

    // 계약 금액 (잔금)
    remainAmt: numeric("remain_amt"),
    remainAmtRate: numeric("remain_amt_rate", { precision: 5, scale: 2 }),

    // 보증/이행 (계약)
    contImplYn: varchar("cont_impl_yn", { length: 1 }),
    contPublYn: varchar("cont_publ_yn", { length: 1 }),
    contGrtRate: numeric("cont_grt_rate", { precision: 5, scale: 2 }),

    // 보증/이행 (선금)
    advanImplYn: varchar("advan_impl_yn", { length: 1 }),
    advanPublYn: varchar("advan_publ_yn", { length: 1 }),
    advanGrtRate: numeric("advan_grt_rate", { precision: 5, scale: 2 }),

    // 보증/이행 (하자)
    defectImplYn: varchar("defect_impl_yn", { length: 1 }),
    defectPublYn: varchar("defect_publ_yn", { length: 1 }),
    defectGrtRate: numeric("defect_grt_rate", { precision: 5, scale: 2 }),
    defectEymd: varchar("defect_eymd", { length: 8 }),

    // 검사 확인
    inspecConfYmd: varchar("inspec_conf_ymd", { length: 8 }),

    // 계획일정 (착수금)
    startAmtPlanYmd: varchar("start_amt_plan_ymd", { length: 8 }),
    startAmtPublYn: varchar("start_amt_publ_yn", { length: 1 }),

    // 계획일정 (중도금 1~5)
    interimAmtPlanYmd1: varchar("interim_amt_plan_ymd_1", { length: 8 }),
    interimAmtPublYn1: varchar("interim_amt_publ_yn_1", { length: 1 }),
    interimAmtPlanYmd2: varchar("interim_amt_plan_ymd_2", { length: 8 }),
    interimAmtPublYn2: varchar("interim_amt_publ_yn_2", { length: 1 }),
    interimAmtPlanYmd3: varchar("interim_amt_plan_ymd_3", { length: 8 }),
    interimAmtPublYn3: varchar("interim_amt_publ_yn_3", { length: 1 }),
    interimAmtPlanYmd4: varchar("interim_amt_plan_ymd_4", { length: 8 }),
    interimAmtPublYn4: varchar("interim_amt_publ_yn_4", { length: 1 }),
    interimAmtPlanYmd5: varchar("interim_amt_plan_ymd_5", { length: 8 }),
    interimAmtPublYn5: varchar("interim_amt_publ_yn_5", { length: 1 }),

    // 계획일정 (잔금)
    remainAmtPlanYmd: varchar("remain_amt_plan_ymd", { length: 8 }),
    remainAmtPublYn: varchar("remain_amt_publ_yn", { length: 1 }),

    // 기타
    befContNo: varchar("bef_cont_no", { length: 30 }),
    contCancelYn: varchar("cont_cancel_yn", { length: 1 }),
    contInitYn: varchar("cont_init_yn", { length: 1 }),
    fileSeq: numeric("file_seq"),
    docNo: varchar("doc_no", { length: 200 }),
    companyAddr: varchar("company_addr", { length: 1000 }),
    companyOner: varchar("company_oner", { length: 200 }),
    sucProb: varchar("suc_prob", { length: 10 }),

    // Memo
    memo: text("memo"),

    // Audit columns
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_contract_ws_idx").on(t.workspaceId),
    wsCustIdx: index("sales_contract_ws_cust_idx").on(t.workspaceId, t.customerNo),
    wsContYmdIdx: index("sales_contract_ws_cont_ymd_idx").on(t.workspaceId, t.contYmd),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard is effective only after ETL populates
    // all three legacy_* columns. Pre-ETL rows with NULL keys bypass dedup.
    legacyUniq: uniqueIndex("sales_contract_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.legacyContYear,
      t.legacyContNo,
    ),
  }),
);

export const salesContractMonth = pgTable(
  "sales_contract_month",
  {
    // PK + workspace
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    // FK to sales_contract
    contractId: uuid("contract_id").notNull().references(() => salesContract.id, { onDelete: "cascade" }),

    // Legacy composite key (nullable for ETL re-import)
    legacyContYear: varchar("legacy_cont_year", { length: 4 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),
    legacySeq: numeric("legacy_seq"),
    legacyYm: varchar("legacy_ym", { length: 6 }),

    // Billing target
    ym: varchar("ym", { length: 6 }).notNull(),
    billTargetYn: varchar("bill_target_yn", { length: 1 }),

    // PLAN (15 cols: 2 man-month + 9 amounts + rent/sga/exp + 1 indirect_grp + 1 indirect_com)
    planInManMonth: numeric("plan_in_man_month", { precision: 15, scale: 10 }),
    planOutManMonth: numeric("plan_out_man_month", { precision: 15, scale: 10 }),
    planServSaleAmt: numeric("plan_serv_sale_amt"),
    planProdSaleAmt: numeric("plan_prod_sale_amt"),
    planInfSaleAmt: numeric("plan_inf_sale_amt"),
    planServInCostAmt: numeric("plan_serv_in_cost_amt"),
    planServOutCostAmt: numeric("plan_serv_out_cost_amt"),
    planProdCostAmt: numeric("plan_prod_cost_amt"),
    planInCostAmt: numeric("plan_in_cost_amt"),
    planOutCostAmt: numeric("plan_out_cost_amt"),
    planIndirectGrpAmt: numeric("plan_indirect_grp_amt"),
    planIndirectComAmt: numeric("plan_indirect_com_amt"),
    planRentAmt: numeric("plan_rent_amt"),
    planSgaAmt: numeric("plan_sga_amt"),
    planExpAmt: numeric("plan_exp_amt"),

    // VIEW (15 cols same shape)
    viewInManMonth: numeric("view_in_man_month", { precision: 15, scale: 10 }),
    viewOutManMonth: numeric("view_out_man_month", { precision: 15, scale: 10 }),
    viewServSaleAmt: numeric("view_serv_sale_amt"),
    viewProdSaleAmt: numeric("view_prod_sale_amt"),
    viewInfSaleAmt: numeric("view_inf_sale_amt"),
    viewServInCostAmt: numeric("view_serv_in_cost_amt"),
    viewServOutCostAmt: numeric("view_serv_out_cost_amt"),
    viewProdCostAmt: numeric("view_prod_cost_amt"),
    viewInCostAmt: numeric("view_in_cost_amt"),
    viewOutCostAmt: numeric("view_out_cost_amt"),
    viewIndirectGrpAmt: numeric("view_indirect_grp_amt"),
    viewIndirectComAmt: numeric("view_indirect_com_amt"),
    viewRentAmt: numeric("view_rent_amt"),
    viewSgaAmt: numeric("view_sga_amt"),
    viewExpAmt: numeric("view_exp_amt"),

    // PERF (15 cols same shape)
    perfInManMonth: numeric("perf_in_man_month", { precision: 15, scale: 10 }),
    perfOutManMonth: numeric("perf_out_man_month", { precision: 15, scale: 10 }),
    perfServSaleAmt: numeric("perf_serv_sale_amt"),
    perfProdSaleAmt: numeric("perf_prod_sale_amt"),
    perfInfSaleAmt: numeric("perf_inf_sale_amt"),
    perfServInCostAmt: numeric("perf_serv_in_cost_amt"),
    perfServOutCostAmt: numeric("perf_serv_out_cost_amt"),
    perfProdCostAmt: numeric("perf_prod_cost_amt"),
    perfInCostAmt: numeric("perf_in_cost_amt"),
    perfOutCostAmt: numeric("perf_out_cost_amt"),
    perfIndirectGrpAmt: numeric("perf_indirect_grp_amt"),
    perfIndirectComAmt: numeric("perf_indirect_com_amt"),
    perfRentAmt: numeric("perf_rent_amt"),
    perfSgaAmt: numeric("perf_sga_amt"),
    perfExpAmt: numeric("perf_exp_amt"),

    // Tax (2 cols)
    taxOrderAmt: numeric("tax_order_amt"),
    taxServAmt: numeric("tax_serv_amt"),

    // Finalize
    rfcEndYn: varchar("rfc_end_yn", { length: 1 }).default("N"),
    note: text("note"),

    // Audit columns
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_contract_month_ws_idx").on(t.workspaceId),
    contractIdx: index("sales_contract_month_contract_idx").on(t.contractId),
    contractYmIdx: index("sales_contract_month_contract_ym_idx").on(t.contractId, t.ym),
  }),
);
