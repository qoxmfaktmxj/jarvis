import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  primaryKey,
  index
} from "drizzle-orm/pg-core";

export const serviceDeskIncident = pgTable(
  "service_desk_incident",
  {
    workspaceId: uuid("workspace_id").notNull(),
    enterCd: varchar("enter_cd", { length: 50 }).notNull(),
    yyyy: varchar("yyyy", { length: 4 }).notNull(),
    mm: varchar("mm", { length: 2 }).notNull(),
    seq: integer("seq").notNull(),
    higherCd: varchar("higher_cd", { length: 50 }).notNull(),

    higherNm: varchar("higher_nm", { length: 100 }),
    lowerCd: varchar("lower_cd", { length: 50 }),
    lowerNm: varchar("lower_nm", { length: 100 }),
    statusCd: varchar("status_cd", { length: 50 }),
    statusNm: varchar("status_nm", { length: 100 }),
    processSpeed: varchar("process_speed", { length: 50 }),
    title: varchar("title", { length: 1000 }),

    requestCompanyCd: varchar("request_company_cd", { length: 50 }),
    requestCompanyNm: varchar("request_company_nm", { length: 100 }),
    requestDeptCd: varchar("request_dept_cd", { length: 50 }),
    requestDeptNm: varchar("request_dept_nm", { length: 100 }),
    requestEmail: varchar("request_email", { length: 100 }),
    requestId: varchar("request_id", { length: 50 }),
    requestNm: varchar("request_nm", { length: 100 }),
    requestCompleteDate: varchar("request_complete_date", { length: 50 }),

    registerCompanyCd: varchar("register_company_cd", { length: 50 }),
    registerCompanyNm: varchar("register_company_nm", { length: 100 }),
    registerSabun: varchar("register_sabun", { length: 50 }),
    registerNm: varchar("register_nm", { length: 100 }),
    registerDate: varchar("register_date", { length: 50 }),
    registerYyyy: varchar("register_yyyy", { length: 50 }),
    registerMm: varchar("register_mm", { length: 50 }),
    registerDd: varchar("register_dd", { length: 50 }),
    registerNum: varchar("register_num", { length: 50 }),

    appMenu: varchar("app_menu", { length: 1000 }),
    receiptContent: varchar("receipt_content", { length: 4000 }),

    managerCompanyCd: varchar("manager_company_cd", { length: 50 }),
    managerCompanyNm: varchar("manager_company_nm", { length: 100 }),
    managerNm: varchar("manager_nm", { length: 100 }),
    managerDeptCd: varchar("manager_dept_cd", { length: 50 }),
    managerDeptNm: varchar("manager_dept_nm", { length: 100 }),
    managerPosition: varchar("manager_position", { length: 50 }),
    managerEmail: varchar("manager_email", { length: 100 }),
    managerPhone: varchar("manager_phone", { length: 50 }),

    receiptDate: varchar("receipt_date", { length: 50 }),
    businessLevel: varchar("business_level", { length: 50 }),
    completeReserveDate: varchar("complete_reserve_date", { length: 50 }),
    solutionFlag: varchar("solution_flag", { length: 50 }),

    completeContent1: varchar("complete_content_1", { length: 4000 }),
    completeContent2: varchar("complete_content_2", { length: 4000 }),
    completeContent3: varchar("complete_content_3", { length: 4000 }),
    completeContent4: varchar("complete_content_4", { length: 4000 }),

    delayReason: varchar("delay_reason", { length: 1000 }),
    workTime: varchar("work_time", { length: 50 }),
    completeDate: varchar("complete_date", { length: 50 }),
    completeOpenFlag: varchar("complete_open_flag", { length: 50 }),
    processCd: varchar("process_cd", { length: 50 }),
    processNm: varchar("process_nm", { length: 100 }),
    valuation: varchar("valuation", { length: 50 }),
    valuationContent: varchar("valuation_content", { length: 4000 }),

    createdAt: varchar("created_at", { length: 50 }),
    chkdate: timestamp("chkdate", { withTimezone: true }),
    chkid: varchar("chkid", { length: 50 }),
    gubunCd: varchar("gubun_cd", { length: 10 }),
    deleteFlag: varchar("delete_flag", { length: 10 }),

    sharingContents: text("sharing_contents"),
    completeContent: text("complete_content"),
    content: text("content"),

    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.enterCd, t.yyyy, t.mm, t.seq, t.higherCd] }),
    ymIdx: index("sdi_ws_ym_idx").on(t.workspaceId, t.yyyy, t.mm),
    higherStatusIdx: index("sdi_ws_higher_status_idx").on(t.workspaceId, t.higherCd, t.statusCd),
    managerIdx: index("sdi_ws_manager_idx").on(t.workspaceId, t.managerNm),
    reqCompanyIdx: index("sdi_ws_req_company_idx").on(t.workspaceId, t.requestCompanyNm),
  })
);

export type ServiceDeskIncident = typeof serviceDeskIncident.$inferSelect;
export type NewServiceDeskIncident = typeof serviceDeskIncident.$inferInsert;
