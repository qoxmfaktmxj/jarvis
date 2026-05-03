import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./user.js";
import { company } from "./company.js";
import { workspace } from "./tenant.js";

export const maintenanceAssignment = pgTable(
  "maintenance_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    contractNumber: varchar("contract_number", { length: 50 }),
    contractType: varchar("contract_type", { length: 20 }),
    note: text("note"),
    updatedBy: varchar("updated_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_maint_user").on(t.userId),
    companyIdx: index("idx_maint_company").on(t.companyId),
    dateIdx: index("idx_maint_date").on(t.startDate, t.endDate),
    unq: unique("maint_user_company_start_unique").on(t.userId, t.companyId, t.startDate)
  })
);

export const maintenanceAssignmentRelations = relations(maintenanceAssignment, ({ one }) => ({
  user: one(user, { fields: [maintenanceAssignment.userId], references: [user.id] }),
  company: one(company, { fields: [maintenanceAssignment.companyId], references: [company.id] })
}));
