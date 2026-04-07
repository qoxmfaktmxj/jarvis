import {
  bigint,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const rawSource = pgTable("raw_source", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  sourceType: varchar("source_type", { length: 30 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }),
  storagePath: varchar("storage_path", { length: 1000 }),
  mimeType: varchar("mime_type", { length: 200 }),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  checksum: varchar("checksum", { length: 128 }),
  parsedContent: text("parsed_content"),
  ingestStatus: varchar("ingest_status", { length: 30 }).default("pending").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  uploadedBy: uuid("uploaded_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const attachment = pgTable("attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  rawSourceId: uuid("raw_source_id")
    .notNull()
    .references(() => rawSource.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
