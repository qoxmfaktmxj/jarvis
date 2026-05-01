/**
 * packages/db/schema/sales-contract.ts
 *
 * 영업관리 계약 관련 테이블 (TBIZ030~TBIZ032, TBIZ010).
 *
 * - salesContract           (TBIZ030): 계약 마스터 (65 컬럼 nullable wide-table)
 * - salesContractMonth      (TBIZ031): 계약 월별 (planning/view/performance 3-way 데이터)
 * - salesContractAddinfo    (TBIZ032): 계약 부가정보 (5 컬럼 lightweight, contractId FK)
 * - salesContractService    (TBIZ010): 서비스 인력 마스터 (37 컬럼, 인력정보)
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
    fileSeq: integer("file_seq"),
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
    legacySeq: integer("legacy_seq"),
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

export const salesContractAddinfo = pgTable(
  "sales_contract_addinfo",
  {
    // PK + workspace
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    // FK to sales_contract
    contractId: uuid("contract_id").notNull().references(() => salesContract.id, { onDelete: "cascade" }),

    // legacy composite key (TBIZ032 PK: ENTER_CD + CONT_NO + SABUN — no CONT_YEAR)
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacyContNo: varchar("legacy_cont_no", { length: 30 }),
    legacySabun: varchar("legacy_sabun", { length: 13 }),

    // ===== TBIZ032 data column from dump line 387-399 =====
    mailId: varchar("mail_id", { length: 100 }),

    // Audit columns
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_contract_addinfo_ws_idx").on(t.workspaceId),
    contractIdx: index("sales_contract_addinfo_contract_idx").on(t.contractId),
    // NOTE: PostgreSQL unique indexes do not enforce uniqueness when any
    // key column is NULL. This guard is effective only after ETL populates
    // all three legacy_* columns. Pre-ETL rows with NULL keys bypass dedup.
    // TBIZ032 PK: (ENTER_CD, CONT_NO, SABUN). No CONT_YEAR exists.
    legacyUniq: uniqueIndex("sales_contract_addinfo_legacy_uniq").on(
      t.workspaceId,
      t.legacyEnterCd,
      t.legacyContNo,
      t.legacySabun,
    ),
  }),
);

export const salesContractService = pgTable(
  "sales_contract_service",
  {
    // PK + workspace
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),

    // Legacy composite key
    legacyEnterCd: varchar("legacy_enter_cd", { length: 10 }),
    legacySymd: varchar("legacy_symd", { length: 8 }),
    legacyServSabun: varchar("legacy_serv_sabun", { length: 20 }),

    // ===== TBIZ010 columns from dump line 8-46 =====
    // Personnel master info (37 cols)
    servSabun: varchar("serv_sabun", { length: 20 }).notNull(),
    servName: varchar("serv_name", { length: 100 }),
    birYmd: varchar("bir_ymd", { length: 8 }),
    symd: varchar("symd", { length: 8 }),
    eymd: varchar("eymd", { length: 8 }),
    cpyGbCd: varchar("cpy_gb_cd", { length: 20 }),
    cpyName: varchar("cpy_name", { length: 200 }),
    econtAmt: numeric("econt_amt"),
    econtCnt: varchar("econt_cnt", { length: 20 }),
    job: varchar("job", { length: 200 }),
    tel: varchar("tel", { length: 50 }),
    mail: varchar("mail", { length: 50 }),
    addr: varchar("addr", { length: 500 }),
    attendCd: varchar("attend_cd", { length: 10 }),
    skillCd: varchar("skill_cd", { length: 10 }),
    cmmncCd: varchar("cmmnc_cd", { length: 10 }),
    rsponsCd: varchar("rspons_cd", { length: 10 }),
    memo1: varchar("memo1", { length: 4000 }),
    memo2: varchar("memo2", { length: 4000 }),
    memo3: varchar("memo3", { length: 4000 }),
    orgCd: varchar("org_cd", { length: 10 }),
    manager: varchar("manager", { length: 13 }),
    pjtCd: varchar("pjt_cd", { length: 20 }),
    pjtNm: varchar("pjt_nm", { length: 300 }),
    etc1: varchar("etc1", { length: 100 }),
    etc2: varchar("etc2", { length: 100 }),
    etc3: varchar("etc3", { length: 100 }),
    etc4: varchar("etc4", { length: 100 }),
    etc5: varchar("etc5", { length: 100 }),
    etc6: varchar("etc6", { length: 100 }),
    etc7: varchar("etc7", { length: 100 }),
    etc8: varchar("etc8", { length: 100 }),
    etc9: varchar("etc9", { length: 100 }),
    etc10: varchar("etc10", { length: 100 }),

    // Audit columns
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsIdx: index("sales_contract_service_ws_idx").on(t.workspaceId),
    wsServSabunIdx: index("sales_contract_service_ws_serv_sabun_idx").on(t.workspaceId, t.servSabun),
    wsPjtIdx: index("sales_contract_service_ws_pjt_idx").on(t.workspaceId, t.pjtCd),
  }),
);
