/**
 * packages/db/schema/sales-customer.ts
 *
 * 영업관리 고객사 관련 테이블 (TBIZ100~TBIZ105).
 *
 * - salesCustomer      (TBIZ100): 고객사 마스터
 * - salesCustomerCharger (TBIZ101): 고객사 담당자 (사내 담당자 지정)
 * - salesCustomerOrg    (TBIZ102): 고객사 조직
 * - salesCustomerMemo   (TBIZ103): 고객사 메모
 * - salesCustomerContact (TBIZ105): 고객사 컨택 담당자 (고객측)
 */
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const salesCustomer = pgTable(
  "sales_customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    custCd: text("cust_cd").notNull(),
    custNm: text("cust_nm").notNull(),
    custKindCd: text("cust_kind_cd"),
    custDivCd: text("cust_div_cd"),
    exchangeTypeCd: text("exchange_type_cd"),
    custSourceCd: text("cust_source_cd"),
    custImprCd: text("cust_impr_cd"),
    buyInfoCd: text("buy_info_cd"),
    buyInfoDtCd: text("buy_info_dt_cd"),
    ceoNm: text("ceo_nm"),
    telNo: text("tel_no"),
    businessNo: text("business_no"),
    faxNo: text("fax_no"),
    businessText: text("business_text"),
    businessKind: text("business_kind"),
    homepage: text("homepage"),
    addrNo: text("addr_no"),
    addr1: text("addr1"),
    addr2: text("addr2"),
    fileSeq: integer("file_seq"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsCustCdUnique: uniqueIndex("sales_customer_ws_cust_cd_unique").on(t.workspaceId, t.custCd),
    wsIdx: index("sales_customer_ws_idx").on(t.workspaceId),
  }),
);

export const salesCustomerCharger = pgTable(
  "sales_customer_charger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    chargerDivCd: text("charger_div_cd").notNull(),
    sabun: text("sabun").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    wsCustIdx: index("sales_customer_charger_ws_cust_idx").on(t.workspaceId, t.customerId),
    uniq: uniqueIndex("sales_customer_charger_uniq").on(
      t.workspaceId,
      t.customerId,
      t.chargerDivCd,
      t.sabun,
    ),
  }),
);

export const salesCustomerOrg = pgTable(
  "sales_customer_org",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    orgCd: text("org_cd").notNull(),
    orgNm: text("org_nm"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("sales_customer_org_uniq").on(t.workspaceId, t.customerId, t.orgCd),
  }),
);

export const salesCustomerMemo = pgTable(
  "sales_customer_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
  },
  (t) => ({
    wsCustIdx: index("sales_customer_memo_ws_cust_idx").on(t.workspaceId, t.customerId),
    uniq: uniqueIndex("sales_customer_memo_uniq").on(t.workspaceId, t.customerId, t.comtSeq),
  }),
);

export const salesCustomerContact = pgTable(
  "sales_customer_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    custMcd: text("cust_mcd").notNull(),
    customerId: uuid("customer_id"),
    custName: text("cust_name"),
    jikweeNm: text("jikwee_nm"),
    orgNm: text("org_nm"),
    telNo: text("tel_no"),
    hpNo: text("hp_no"),
    email: text("email"),
    custSourceCd: text("cust_source_cd"),
    custImpCd: text("cust_imp_cd"),
    custFrdCd: text("cust_frd_cd"),
    statusYn: boolean("status_yn").default(true),
    addrNo: text("addr_no"),
    addr1: text("addr1"),
    addr2: text("addr2"),
    chargerWorkText: text("charger_work_text"),
    sabun: text("sabun"),
    fileSeq: integer("file_seq"),
    switComp: text("swit_comp"),
    lastWorkDate: date("last_work_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    uniq: uniqueIndex("sales_customer_contact_uniq").on(t.workspaceId, t.custMcd),
    wsCustIdx: index("sales_customer_contact_ws_cust_idx").on(t.workspaceId, t.customerId),
  }),
);
