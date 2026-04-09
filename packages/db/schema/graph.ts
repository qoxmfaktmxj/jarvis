// packages/db/schema/graph.ts

import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { rawSource } from './file.js';
import { user } from './user.js';

export const graphSnapshot = pgTable('graph_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id),
  rawSourceId: uuid('raw_source_id').references(() => rawSource.id),
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
  buildStatus: varchar('build_status', { length: 20 }).default('pending').notNull(),
  buildDurationMs: integer('build_duration_ms'),
  buildError: varchar('build_error', { length: 2000 }),

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

  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('idx_graph_snapshot_workspace').on(table.workspaceId),
  statusIdx: index('idx_graph_snapshot_status').on(table.buildStatus),
}));
