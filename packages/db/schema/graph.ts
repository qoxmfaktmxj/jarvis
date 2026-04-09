// packages/db/schema/graph.ts

import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { rawSource } from './file.js';
import { user } from './user.js';

export const buildStatusEnum = pgEnum('build_status', [
  'pending',
  'running',
  'done',
  'error',
]);

export const graphSnapshot = pgTable('graph_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  rawSourceId: uuid('raw_source_id').references(() => rawSource.id, {
    onDelete: 'set null',
  }),
  title: varchar('title', { length: 500 }).notNull(),

  // MinIO storage paths
  graphJsonPath: varchar('graph_json_path', { length: 1000 }),
  graphHtmlPath: varchar('graph_html_path', { length: 1000 }),

  // Build statistics
  nodeCount: integer('node_count'),
  edgeCount: integer('edge_count'),
  communityCount: integer('community_count'),
  fileCount: integer('file_count'),

  // Build metadata
  buildMode: varchar('build_mode', { length: 20 }).default('standard').notNull(),
  // Use pgEnum for DB-level constraint on known status values
  buildStatus: buildStatusEnum('build_status').default('pending').notNull(),
  buildDurationMs: integer('build_duration_ms'),
  // text (no length cap) — Graphify error stack traces can be long
  buildError: text('build_error'),

  // Analysis summary from Graphify
  analysisMetadata: jsonb('analysis_metadata')
    .$type<{
      godNodes?: string[];
      communityLabels?: string[];
      suggestedQuestions?: string[];
      tokenReduction?: number;
    }>()
    .default({})
    .notNull(),

  createdBy: uuid('created_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // Callers must explicitly set updatedAt on every UPDATE — no DB trigger
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Composite index for the primary query pattern: snapshots for workspace X with status Y
  workspaceStatusIdx: index('idx_graph_snapshot_workspace_status').on(
    table.workspaceId,
    table.buildStatus,
  ),
  // Single-column workspace index for listing all snapshots in a workspace
  workspaceIdx: index('idx_graph_snapshot_workspace').on(table.workspaceId),
}));
