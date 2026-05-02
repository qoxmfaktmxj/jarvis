import {
  index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";
import { salesCustomer, salesCustomerContact } from "./sales-customer.js";
import { salesOpportunity } from "./sales-opportunity.js";

export const salesActivity = pgTable(
  "sales_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    legacyEnterCd: text("legacy_enter_cd"),
    legacyBizActCd: text("legacy_biz_act_cd"),
    legacyBizOpCd: text("legacy_biz_op_cd"),
    legacyCustCd: text("legacy_cust_cd"),
    legacyCustMcd: text("legacy_cust_mcd"),
    legacyAttSabun: text("legacy_att_sabun"),
    bizActNm: text("biz_act_nm").notNull(),
    opportunityId: uuid("opportunity_id").references(() => salesOpportunity.id),
    customerId: uuid("customer_id").references(() => salesCustomer.id),
    contactId: uuid("contact_id").references(() => salesCustomerContact.id),
    actYmd: text("act_ymd"),
    actTypeCode: text("act_type_code"),
    accessRouteCode: text("access_route_code"),
    bizStepCode: text("biz_step_code"),
    productTypeCode: text("product_type_code"),
    actContent: text("act_content"),
    attendeeUserId: uuid("attendee_user_id").references(() => user.id),
    legacyFileSeq: integer("legacy_file_seq"),
    memo: text("memo"),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    legacyUniq: uniqueIndex("sales_activity_legacy_uniq").on(t.workspaceId, t.legacyBizActCd),
    wsIdx: index("sales_activity_ws_idx").on(t.workspaceId),
    wsOppIdx: index("sales_activity_ws_opp_idx").on(t.workspaceId, t.opportunityId),
    wsActYmdIdx: index("sales_activity_ws_act_ymd_idx").on(t.workspaceId, t.actYmd),
  }),
);

export const salesActivityMemo = pgTable(
  "sales_activity_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    activityId: uuid("activity_id").notNull().references(() => salesActivity.id, { onDelete: "cascade" }),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo").notNull(),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    seqUniq: uniqueIndex("sales_activity_memo_seq_uniq").on(t.activityId, t.comtSeq),
    actIdx: index("sales_activity_memo_act_idx").on(t.activityId),
  }),
);
