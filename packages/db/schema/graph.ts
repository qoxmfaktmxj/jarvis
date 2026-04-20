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
  uniqueIndex,
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

export const graphScopeTypeEnum = pgEnum('graph_scope_type', [
  'attachment',
  'project',  // was 'system' — now means TSMT001 project inventory
  'workspace',
]);

export const graphSnapshot = pgTable('graph_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  rawSourceId: uuid('raw_source_id').references(() => rawSource.id, {
    onDelete: 'set null',
  }),
  scopeType: graphScopeTypeEnum('scope_type').notNull().default('workspace'),
  scopeId: uuid('scope_id').notNull(),
  sensitivity: varchar('sensitivity', { length: 30 })
    .default('INTERNAL')
    .notNull(),
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
  // Composite index for scope-filtered picker queries
  scopeIdx: index('idx_graph_snapshot_scope').on(
    table.workspaceId,
    table.scopeType,
    table.scopeId,
    table.buildStatus,
  ),
}));

export const graphNode = pgTable('graph_node', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 500 }).notNull(),
  label: varchar('label', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  sourceFile: varchar('source_file', { length: 1000 }),
  sourceLocation: varchar('source_location', { length: 50 }),
  communityId: integer('community_id'),
  metadata: jsonb('metadata')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotNodeIdx: uniqueIndex('idx_graph_node_snapshot_node').on(table.snapshotId, table.nodeId),
  communityIdx: index('idx_graph_node_community').on(table.snapshotId, table.communityId),
  labelIdx: index('idx_graph_node_label').on(table.label),
}));

export const graphEdge = pgTable('graph_edge', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  sourceNodeId: varchar('source_node_id', { length: 500 }).notNull(),
  targetNodeId: varchar('target_node_id', { length: 500 }).notNull(),
  relation: varchar('relation', { length: 100 }).notNull(),
  confidence: varchar('confidence', { length: 20 }).notNull(),
  confidenceScore: varchar('confidence_score', { length: 10 }),
  sourceFile: varchar('source_file', { length: 1000 }),
  weight: varchar('weight', { length: 10 }).default('1.0'),
  metadata: jsonb('metadata')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotSourceIdx: index('idx_graph_edge_snapshot_source').on(table.snapshotId, table.sourceNodeId),
  snapshotTargetIdx: index('idx_graph_edge_snapshot_target').on(table.snapshotId, table.targetNodeId),
  relationIdx: index('idx_graph_edge_relation').on(table.snapshotId, table.relation),
}));

export const graphCommunity = pgTable('graph_community', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  communityId: integer('community_id').notNull(),
  label: varchar('label', { length: 500 }),
  nodeCount: integer('node_count').notNull(),
  cohesionScore: varchar('cohesion_score', { length: 10 }),
  topNodes: jsonb('top_nodes')
    .$type<string[]>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_graph_community_snapshot_community').on(table.snapshotId, table.communityId),
]);
