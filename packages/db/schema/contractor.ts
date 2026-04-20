import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const contractorContract = pgTable(
  "contractor_contract",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enterCd: varchar("enter_cd", { length: 30 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    generatedLeaveHours: numeric("generated_leave_hours", { precision: 6, scale: 1 })
      .notNull(),
    additionalLeaveHours: numeric("additional_leave_hours", { precision: 6, scale: 1 })
      .default("0")
      .notNull(),
    note: text("note"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_contract_user").on(t.userId),
    statusIdx: index("idx_contract_status").on(t.status)
  })
);

export const leaveRequest = pgTable(
  "leave_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contractorContract.id),
    type: varchar("type", { length: 20 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    timeFrom: timestamp("time_from", { withTimezone: true }),
    timeTo: timestamp("time_to", { withTimezone: true }),
    hours: numeric("hours", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).default("approved").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_leave_user").on(t.userId),
    contractIdx: index("idx_leave_contract").on(t.contractId),
    dateIdx: index("idx_leave_date").on(t.startDate, t.endDate)
  })
);

export const holiday = pgTable(
  "holiday",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    date: date("date").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    uniqDate: unique("holiday_workspace_date_unique").on(t.workspaceId, t.date),
    dateIdx: index("idx_holiday_date").on(t.date)
  })
);

export const contractorContractRelations = relations(contractorContract, ({ one, many }) => ({
  user: one(user, { fields: [contractorContract.userId], references: [user.id] }),
  leaveRequests: many(leaveRequest)
}));

export const leaveRequestRelations = relations(leaveRequest, ({ one }) => ({
  user: one(user, { fields: [leaveRequest.userId], references: [user.id], relationName: "leave_user" }),
  contract: one(contractorContract, { fields: [leaveRequest.contractId], references: [contractorContract.id] }),
  creator: one(user, { fields: [leaveRequest.createdBy], references: [user.id], relationName: "leave_creator" })
}));
