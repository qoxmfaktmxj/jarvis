import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";

export const monthReportMaster = pgTable("month_report_master", {
  workspaceId: uuid("workspace_id").notNull(),
  enterCd: varchar("enter_cd", { length: 10 }).notNull(),
  companyCd: varchar("company_cd", { length: 10 }).notNull(),
  dd: varchar("dd", { length: 2 }),
  monthType: varchar("month_type", { length: 10 }),
  sendType: varchar("send_type", { length: 10 }),
  seq: integer("seq"),
  signatureYn: varchar("signature_yn", { length: 10 }),
  userCntYn: varchar("user_cnt_yn", { length: 10 }),
  cpnCntYn: varchar("cpn_cnt_yn", { length: 10 }),
  workTypeYn: varchar("work_type_yn", { length: 10 }),
  treatTypeYn: varchar("treat_type_yn", { length: 10 }),
  solvedYn: varchar("solved_yn", { length: 10 }),
  unsolvedYn: varchar("unsolved_yn", { length: 10 }),
  chargerYn: varchar("charger_yn", { length: 10 }),
  infraYn: varchar("infra_yn", { length: 10 }),
  replyYn: varchar("reply_yn", { length: 10 }),
  workTypeCd: varchar("work_type_cd", { length: 10 }),
  treatTypeCd: varchar("treat_type_cd", { length: 10 }),
  chargerSabun1: varchar("charger_sabun_1", { length: 50 }),
  chargerSabun2: varchar("charger_sabun_2", { length: 50 }),
  senderSabun: varchar("sender_sabun", { length: 50 }),
  autoTermTypeCd: varchar("auto_term_type_cd", { length: 30 }).default("4"),
  autoMonth: varchar("auto_month", { length: 30 }),
  autoDate: varchar("auto_date", { length: 30 }),
  autoCharger: varchar("auto_charger", { length: 15 }),
  autoChargerSabun: varchar("auto_charger_sabun", { length: 50 }),
  autoChargerMail: varchar("auto_charger_mail", { length: 50 }),
  autoRcvMail: varchar("auto_rcv_mail", { length: 300 }),
  autoRefMail: varchar("auto_ref_mail", { length: 300 }),
  autoFinalSendDate: varchar("auto_final_send_date", { length: 30 }),
  autoSettingTypeCd: varchar("auto_setting_type_cd", { length: 10 }),
  autoStartDate: varchar("auto_start_date", { length: 2 }),
  autoEndDate: varchar("auto_end_date", { length: 2 }),
  attr1: varchar("attr1", { length: 4000 }),
  attr2: varchar("attr2", { length: 4000 }),
  attr3: varchar("attr3", { length: 4000 }),
  attr4: varchar("attr4", { length: 4000 }),
  updatedBy: uuid("updated_by"),
  updatedByName: varchar("updated_by_name", { length: 100 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspaceId, t.enterCd, t.companyCd] }),
}));

export const monthReportDetailMonth = pgTable("month_report_detail_month", {
  workspaceId: uuid("workspace_id").notNull(),
  enterCd: varchar("enter_cd", { length: 10 }).notNull(),
  companyCd: varchar("company_cd", { length: 10 }).notNull(),
  ym: varchar("ym", { length: 6 }).notNull(),
  aaCnt: integer("aa_cnt"),
  raCnt: integer("ra_cnt"),
  newCnt: integer("new_cnt"),
  cpnCnt: integer("cpn_cnt"),
  attr1: text("attr1"),
  attr2: text("attr2"),
  attr3: text("attr3"),
  attr4: text("attr4"),
  attr5: text("attr5"),
  attr6: text("attr6"),
  fileSeq: integer("file_seq"),
  monthFileSeq: integer("month_file_seq"),
  log: text("log"),
  updatedBy: uuid("updated_by"),
  updatedByName: varchar("updated_by_name", { length: 100 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  pk: primaryKey({
    columns: [t.workspaceId, t.enterCd, t.companyCd, t.ym],
  }),
}));

export const monthReportDetailOther = pgTable("month_report_detail_other", {
  workspaceId: uuid("workspace_id").notNull(),
  enterCd: varchar("enter_cd", { length: 10 }).notNull(),
  companyCd: varchar("company_cd", { length: 10 }).notNull(),
  ym: varchar("ym", { length: 6 }).notNull(),
  seq: integer("seq").notNull(),
  etcBizCd: varchar("etc_biz_cd", { length: 10 }),
  etcTitle: varchar("etc_title", { length: 100 }),
  etcMemo: text("etc_memo"),
  attr1: text("attr1"),
  attr2: text("attr2"),
  attr3: text("attr3"),
  attr4: text("attr4"),
  updatedBy: uuid("updated_by"),
  updatedByName: varchar("updated_by_name", { length: 100 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  pk: primaryKey({
    columns: [t.workspaceId, t.enterCd, t.companyCd, t.ym, t.seq],
  }),
}));

export type MonthReportMaster = typeof monthReportMaster.$inferSelect;
export type MonthReportDetailMonth = typeof monthReportDetailMonth.$inferSelect;
export type MonthReportDetailOther = typeof monthReportDetailOther.$inferSelect;
export type NewMonthReportMaster = typeof monthReportMaster.$inferInsert;
export type NewMonthReportDetailMonth =
  typeof monthReportDetailMonth.$inferInsert;
export type NewMonthReportDetailOther = typeof monthReportDetailOther.$inferInsert;
