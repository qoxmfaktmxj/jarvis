import {
  boolean,
  customType,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

const tsvectorType = customType<{ data: string }>({
  dataType: () => "tsvector"
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  userId: uuid("user_id").references(() => user.id),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }).notNull(),
  resourceId: uuid("resource_id"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  searchVector: tsvectorType("search_vector")
});
