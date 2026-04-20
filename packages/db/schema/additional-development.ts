import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { project } from "./project.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const additionalDevelopment = pgTable("additional_development", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "restrict" }),

  // 요청
  requestYearMonth: varchar("request_year_month", { length: 7 }),
  requestSequence: integer("request_sequence"),
  requesterName: varchar("requester_name", { length: 100 }),
  requestContent: text("request_content"),
  part: varchar("part", { length: 20 }),
  status: varchar("status", { length: 30 }).default("협의중").notNull(),

  // 프로젝트/계약
  projectName: varchar("project_name", { length: 500 }),
  contractNumber: varchar("contract_number", { length: 50 }),
  contractStartMonth: varchar("contract_start_month", { length: 7 }),
  contractEndMonth: varchar("contract_end_month", { length: 7 }),
  contractAmount: numeric("contract_amount", { precision: 14, scale: 0 }),
  isPaid: boolean("is_paid"),
  invoiceIssued: boolean("invoice_issued"),
  inspectionConfirmed: boolean("inspection_confirmed"),
  estimateProgress: text("estimate_progress"),

  // 개발
  devStartDate: date("dev_start_date"),
  devEndDate: date("dev_end_date"),
  pmId: uuid("pm_id").references(() => user.id),
  developerId: uuid("developer_id").references(() => user.id),
  vendorContactNote: text("vendor_contact_note"),
  estimatedEffort: numeric("estimated_effort", { precision: 8, scale: 2 }),
  actualEffort: numeric("actual_effort", { precision: 8, scale: 2 }),

  // 메타
  attachmentFileRef: varchar("attachment_file_ref", { length: 500 }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("idx_add_dev_project").on(t.projectId),
  statusIdx: index("idx_add_dev_status").on(t.status),
  yearMonthIdx: index("idx_add_dev_year_month").on(t.requestYearMonth),
}));

export const additionalDevelopmentEffort = pgTable("additional_development_effort", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  effort: numeric("effort", { precision: 8, scale: 2 }).notNull(),
}, (t) => ({
  ymUnq: uniqueIndex("add_dev_effort_ym_unique").on(t.addDevId, t.yearMonth),
}));

export const additionalDevelopmentRevenue = pgTable("additional_development_revenue", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 0 }).notNull(),
}, (t) => ({
  ymUnq: uniqueIndex("add_dev_revenue_ym_unique").on(t.addDevId, t.yearMonth),
}));

export const additionalDevelopmentStaff = pgTable("additional_development_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => user.id),
  role: varchar("role", { length: 50 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
});

export const additionalDevelopmentRelations = relations(additionalDevelopment, ({ many, one }) => ({
  project: one(project, { fields: [additionalDevelopment.projectId], references: [project.id] }),
  pm: one(user, { fields: [additionalDevelopment.pmId], references: [user.id], relationName: "addDevPm" }),
  developer: one(user, { fields: [additionalDevelopment.developerId], references: [user.id], relationName: "addDevDeveloper" }),
  efforts: many(additionalDevelopmentEffort),
  revenues: many(additionalDevelopmentRevenue),
  staff: many(additionalDevelopmentStaff),
}));
