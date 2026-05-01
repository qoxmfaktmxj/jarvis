import {
  bigint, boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";
import { salesCustomer, salesCustomerContact } from "./sales-customer.js";

export const salesOpportunity = pgTable(
  "sales_opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    legacyEnterCd: text("legacy_enter_cd"),
    legacyBizOpCd: text("legacy_biz_op_cd"),
    legacyCustCd: text("legacy_cust_cd"),
    legacyCustMcd: text("legacy_cust_mcd"),
    legacyCustName: text("legacy_cust_name"),
    bizOpNm: text("biz_op_nm").notNull(),
    customerId: uuid("customer_id").references(() => salesCustomer.id),
    contactId: uuid("contact_id").references(() => salesCustomerContact.id),
    customerName: text("customer_name"),
    lastDlvCustomerName: text("last_dlv_customer_name"),
    lastDlvCustomerCd: text("last_dlv_customer_cd"),
    lastDlvSeq: text("last_dlv_seq"),
    saleTypeCode: text("sale_type_code"),
    bizTypeCode: text("biz_type_code"),
    bizTypeDetailCode: text("biz_type_detail_code"),
    bizOpSourceCode: text("biz_op_source_code"),
    industryCode: text("industry_code"),
    bizStepCode: text("biz_step_code"),
    bizImpCode: text("biz_imp_code"),
    contPerCode: text("cont_per_code"),
    bizAreaCode: text("biz_area_code"),
    bizAreaDetail: text("biz_area_detail"),
    custTypeCode: text("cust_type_code"),
    productTypeCode: text("product_type_code"),
    contExpecAmt: bigint("cont_expec_amt", { mode: "number" }),
    contImplPer: numeric("cont_impl_per", { precision: 5, scale: 2 }),
    expecApplyAmt: bigint("expec_apply_amt", { mode: "number" }),
    contExpecYmd: text("cont_expec_ymd"),
    contExpecSymd: text("cont_expec_symd"),
    contExpecEymd: text("cont_expec_eymd"),
    bizStepYmd: text("biz_step_ymd"),
    focusMgrYn: boolean("focus_mgr_yn").default(false).notNull(),
    legacyFileSeq: integer("legacy_file_seq"),
    memo: text("memo"),
    orgNm: text("org_nm"),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    legacyUniq: uniqueIndex("sales_opportunity_legacy_uniq").on(t.workspaceId, t.legacyBizOpCd),
    wsIdx: index("sales_opportunity_ws_idx").on(t.workspaceId),
    wsStepIdx: index("sales_opportunity_ws_step_idx").on(t.workspaceId, t.bizStepCode),
    wsInsIdx: index("sales_opportunity_ws_ins_idx").on(t.workspaceId, t.insDate),
  }),
);

export const salesOpportunityMemo = pgTable(
  "sales_opportunity_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    opportunityId: uuid("opportunity_id").notNull().references(() => salesOpportunity.id, { onDelete: "cascade" }),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo").notNull(),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    seqUniq: uniqueIndex("sales_opportunity_memo_seq_uniq").on(t.opportunityId, t.comtSeq),
    oppIdx: index("sales_opportunity_memo_opp_idx").on(t.opportunityId),
  }),
);
