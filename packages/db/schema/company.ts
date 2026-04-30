import { boolean, date, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    groupCode: varchar("group_code", { length: 50 }),
    objectDiv: varchar("object_div", { length: 10 }).notNull().default("001"),
    manageDiv: varchar("manage_div", { length: 50 }),
    representCompany: boolean("represent_company").notNull().default(false),
    category: varchar("category", { length: 50 }),
    startDate: date("start_date"),
    industryCode: varchar("industry_code", { length: 50 }),
    zip: varchar("zip", { length: 10 }),
    address: text("address"),
    homepage: varchar("homepage", { length: 500 }),
    updatedBy: varchar("updated_by", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsCodeObjUnique: uniqueIndex("company_ws_code_objdiv_unique").on(
      t.workspaceId,
      t.code,
      t.objectDiv,
    ),
  }),
);
