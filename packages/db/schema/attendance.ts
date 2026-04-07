import {
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  attendDate: date("attend_date").notNull(),
  status: varchar("status", { length: 30 }).default("present").notNull(),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const outManage = pgTable("out_manage", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  outDate: date("out_date").notNull(),
  outType: varchar("out_type", { length: 50 }).notNull(),
  destination: varchar("destination", { length: 500 }),
  purpose: text("purpose").notNull(),
  companyId: uuid("company_id").references(() => company.id),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  approvedBy: uuid("approved_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const outManageDetail = pgTable("out_manage_detail", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  outManageId: uuid("out_manage_id")
    .notNull()
    .references(() => outManage.id, { onDelete: "cascade" }),
  timeFrom: timestamp("time_from", { withTimezone: true }).notNull(),
  timeTo: timestamp("time_to", { withTimezone: true }).notNull(),
  activity: varchar("activity", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const outManageRelations = relations(outManage, ({ many }) => ({
  details: many(outManageDetail)
}));
