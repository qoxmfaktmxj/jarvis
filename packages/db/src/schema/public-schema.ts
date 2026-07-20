import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const auditDates = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roleCodeEnum = pgEnum("role_code", ["ADMIN", "EDITOR", "READER"]);
export const accountTypeEnum = pgEnum("account_type", ["human", "demo"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const menuKindEnum = pgEnum("menu_kind", ["group", "page"]);
export const sourceTypeEnum = pgEnum("source_type", ["law", "case", "interpretation", "guide"]);
export const sourceParseStatusEnum = pgEnum("source_parse_status", ["stored", "parsed", "failed"]);
export const wikiZoneEnum = pgEnum("wiki_zone", ["auto", "manual"]);
export const wikiPageTypeEnum = pgEnum("wiki_page_type", ["source", "concept", "case", "guide", "synthesis"]);
export const wikiPublishStatusEnum = pgEnum("wiki_publish_status", ["draft", "published", "archived"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "in_review", "resolved", "dismissed"]);

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    ...auditDates(),
  },
  (table) => [uniqueIndex("workspace_code_uniq").on(table.code)],
);

export const appUser = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    status: userStatusEnum("status").default("active").notNull(),
    accountType: accountTypeEnum("account_type").default("human").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}).notNull(),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("app_user_workspace_email_uniq").on(table.workspaceId, table.email),
    index("app_user_demo_expiry_idx").on(table.workspaceId, table.accountType, table.expiresAt),
    check(
      "app_user_password_contract",
      sql`(
        ${table.accountType} = 'demo'
        AND ${table.passwordHash} IS NULL
        AND ${table.expiresAt} IS NOT NULL
      ) OR (
        ${table.accountType} = 'human'
        AND ${table.passwordHash} IS NOT NULL
      )`,
    ),
  ],
);

export const role = pgTable(
  "role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    code: roleCodeEnum("code").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("role_workspace_code_uniq").on(table.workspaceId, table.code)],
);

export const permission = pgTable(
  "permission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 80 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("permission_code_uniq").on(table.code)],
);

export const userRole = pgTable(
  "user_role",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    uniqueIndex("user_role_one_role_per_user_uniq").on(table.userId),
    index("user_role_workspace_idx").on(table.workspaceId),
  ],
);

export const rolePermission = pgTable(
  "role_permission",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permission_workspace_idx").on(table.workspaceId),
  ],
);

export const userSession = pgTable(
  "user_session",
  {
    sessionTokenHash: varchar("session_token_hash", { length: 64 }).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_session_workspace_user_idx").on(table.workspaceId, table.userId),
    index("user_session_expiry_idx").on(table.expiresAt),
  ],
);

export const menuItem = pgTable(
  "menu_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => menuItem.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    description: varchar("description", { length: 300 }),
    kind: menuKindEnum("kind").notNull(),
    icon: varchar("icon", { length: 50 }),
    routePath: varchar("route_path", { length: 300 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("menu_item_workspace_code_uniq").on(table.workspaceId, table.code),
    uniqueIndex("menu_item_workspace_route_uniq")
      .on(table.workspaceId, table.routePath)
      .where(sql`${table.routePath} IS NOT NULL`),
    index("menu_item_workspace_parent_sort_idx").on(table.workspaceId, table.parentId, table.sortOrder),
    check(
      "menu_item_route_contract",
      sql`(
        ${table.kind} = 'group'
        AND ${table.routePath} IS NULL
      ) OR (
        ${table.kind} = 'page'
        AND ${table.routePath} IS NOT NULL
      )`,
    ),
  ],
);

export const menuPermission = pgTable(
  "menu_permission",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItem.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.menuItemId, table.permissionId] }),
    index("menu_permission_workspace_idx").on(table.workspaceId),
  ],
);

export const codeGroup = pgTable(
  "code_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").default(true).notNull(),
    ...auditDates(),
  },
  (table) => [uniqueIndex("code_group_workspace_code_uniq").on(table.workspaceId, table.code)],
);

export const codeItem = pgTable(
  "code_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => codeGroup.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("code_item_group_code_uniq").on(table.groupId, table.code),
    index("code_item_workspace_group_idx").on(table.workspaceId, table.groupId),
  ],
);

export const sourceDocument = pgTable(
  "source_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 80 }).notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    externalId: varchar("external_id", { length: 180 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    canonicalUrl: varchar("canonical_url", { length: 500 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    searchVector: tsvector("search_vector"),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("source_document_identity_uniq").on(table.workspaceId, table.provider, table.externalId),
    index("source_document_workspace_type_idx").on(table.workspaceId, table.sourceType),
  ],
);

export const sourceRevision = pgTable(
  "source_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocument.id, { onDelete: "cascade" }),
    revisionKey: varchar("revision_key", { length: 180 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    rawObjectKey: varchar("raw_object_key", { length: 500 }).notNull(),
    normalizedObjectKey: varchar("normalized_object_key", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 160 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    parseStatus: sourceParseStatusEnum("parse_status").default("parsed").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("source_revision_document_key_uniq").on(table.sourceDocumentId, table.revisionKey),
    uniqueIndex("source_revision_document_checksum_uniq").on(table.sourceDocumentId, table.checksumSha256),
    index("source_revision_workspace_document_idx").on(table.workspaceId, table.sourceDocumentId),
    check("source_revision_size_nonnegative", sql`${table.sizeBytes} >= 0`),
    check(
      "source_revision_effective_range",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveFrom} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
);

export const legalCase = pgTable(
  "legal_case",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => sourceRevision.id, { onDelete: "cascade" }),
    courtOrAgency: varchar("court_or_agency", { length: 160 }).notNull(),
    caseNumber: varchar("case_number", { length: 120 }).notNull(),
    decisionDate: date("decision_date").notNull(),
    caseType: varchar("case_type", { length: 100 }).notNull(),
    issues: jsonb("issues").$type<string[]>().default([]).notNull(),
    holdingSummary: text("holding_summary").notNull(),
    disposition: text("disposition"),
    citedProvisions: jsonb("cited_provisions").$type<string[]>().default([]).notNull(),
    searchVector: tsvector("search_vector"),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("legal_case_workspace_case_uniq").on(table.workspaceId, table.courtOrAgency, table.caseNumber),
    uniqueIndex("legal_case_source_revision_uniq").on(table.sourceRevisionId),
    index("legal_case_workspace_date_idx").on(table.workspaceId, table.decisionDate),
  ],
);

export const wikiPageIndex = pgTable(
  "wiki_page_index",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 500 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    slug: varchar("slug", { length: 240 }).notNull(),
    zone: wikiZoneEnum("zone").notNull(),
    pageType: wikiPageTypeEnum("page_type").notNull(),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().default({}).notNull(),
    gitSha: varchar("git_sha", { length: 40 }).notNull(),
    stale: boolean("stale").default(false).notNull(),
    publishedStatus: wikiPublishStatusEnum("published_status").default("draft").notNull(),
    freshnessSlaDays: integer("freshness_sla_days"),
    snippet: varchar("snippet", { length: 500 }).notNull(),
    searchVector: tsvector("search_vector"),
    ...auditDates(),
  },
  (table) => [
    uniqueIndex("wiki_page_index_workspace_path_uniq").on(table.workspaceId, table.path),
    uniqueIndex("wiki_page_index_workspace_slug_uniq").on(table.workspaceId, table.slug),
    index("wiki_page_index_workspace_type_status_idx").on(table.workspaceId, table.pageType, table.publishedStatus),
    check(
      "wiki_page_index_path_scope",
      sql`(${table.zone} = 'auto' AND ${table.path} LIKE 'auto/%') OR (${table.zone} = 'manual' AND ${table.path} LIKE 'manual/%')`,
    ),
  ],
);

export const wikiPageLink = pgTable(
  "wiki_page_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    fromPageId: uuid("from_page_id")
      .notNull()
      .references(() => wikiPageIndex.id, { onDelete: "cascade" }),
    toPageId: uuid("to_page_id").references(() => wikiPageIndex.id, { onDelete: "set null" }),
    toPath: varchar("to_path", { length: 500 }).notNull(),
    alias: varchar("alias", { length: 200 }),
    anchor: varchar("anchor", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wiki_page_link_from_target_uniq").on(
      table.fromPageId,
      table.toPath,
      sql`coalesce(${table.alias}, '')`,
      sql`coalesce(${table.anchor}, '')`,
    ),
    index("wiki_page_link_workspace_from_idx").on(table.workspaceId, table.fromPageId),
  ],
);

export const wikiPageSourceRef = pgTable(
  "wiki_page_source_ref",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPageIndex.id, { onDelete: "cascade" }),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => sourceRevision.id, { onDelete: "restrict" }),
    locator: varchar("locator", { length: 300 }).notNull(),
    effectiveDate: date("effective_date"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).default("1.000").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wiki_page_source_ref_uniq").on(table.pageId, table.sourceRevisionId, table.locator),
    index("wiki_page_source_ref_workspace_revision_idx").on(table.workspaceId, table.sourceRevisionId),
    check("wiki_page_source_ref_confidence", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  ],
);

export const wikiCommitLog = pgTable(
  "wiki_commit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    operation: varchar("operation", { length: 30 }).notNull(),
    authorType: varchar("author_type", { length: 20 }).notNull(),
    authorRef: varchar("author_ref", { length: 200 }),
    affectedPages: jsonb("affected_pages").$type<string[]>().default([]).notNull(),
    reasoning: text("reasoning"),
    sourceRevisionId: uuid("source_revision_id").references(() => sourceRevision.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("wiki_commit_log_workspace_sha_uniq").on(table.workspaceId, table.commitSha)],
);

export const wikiReviewQueue = pgTable(
  "wiki_review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    sourceRevisionId: uuid("source_revision_id").references(() => sourceRevision.id, { onDelete: "set null" }),
    affectedPages: jsonb("affected_pages").$type<string[]>().default([]).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }),
    description: text("description").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: reviewStatusEnum("status").default("pending").notNull(),
    assignedTo: uuid("assigned_to").references(() => appUser.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => appUser.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("wiki_review_queue_workspace_status_idx").on(table.workspaceId, table.status)],
);

export const wikiLintReport = pgTable(
  "wiki_lint_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    reportDate: date("report_date").notNull(),
    orphanCount: integer("orphan_count").default(0).notNull(),
    brokenLinkCount: integer("broken_link_count").default(0).notNull(),
    noOutlinkCount: integer("no_outlink_count").default(0).notNull(),
    contradictionCount: integer("contradiction_count").default(0).notNull(),
    staleCount: integer("stale_count").default(0).notNull(),
    reportPath: varchar("report_path", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("wiki_lint_report_workspace_date_uniq").on(table.workspaceId, table.reportDate)],
);

export const askConversation = pgTable(
  "ask_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 240 }),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    ...auditDates(),
  },
  (table) => [index("ask_conversation_owner_idx").on(table.workspaceId, table.userId, table.updatedAt)],
);

export const askMessage = pgTable(
  "ask_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => askConversation.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    toolName: varchar("tool_name", { length: 80 }),
    tokenCount: integer("token_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ask_message_owner_conversation_idx").on(table.workspaceId, table.userId, table.conversationId, table.createdAt),
  ],
);

export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    answerMessageId: uuid("answer_message_id")
      .notNull()
      .references(() => askMessage.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("answer_feedback_user_answer_uniq").on(table.userId, table.answerMessageId),
    check("answer_feedback_rating", sql`${table.rating} IN (-1, 1)`),
  ],
);

export const llmCallLog = pgTable(
  "llm_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: varchar("call_id", { length: 200 }).notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUser.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    purpose: varchar("purpose", { length: 80 }).notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    completionTokens: integer("completion_tokens").default(0).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).default("0").notNull(),
    latencyMs: integer("latency_ms"),
    success: boolean("success").default(true).notNull(),
    errorCode: varchar("error_code", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("llm_call_log_call_id_uniq").on(table.callId),
    index("llm_call_log_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const searchLog = pgTable(
  "search_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUser.id, { onDelete: "set null" }),
    query: text("query").notNull(),
    scope: varchar("scope", { length: 40 }).notNull(),
    resultCount: integer("result_count").default(0).notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("search_log_workspace_created_idx").on(table.workspaceId, table.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUser.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 120 }).notNull(),
    resourceId: varchar("resource_id", { length: 160 }),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    success: boolean("success").default(true).notNull(),
    errorMessage: varchar("error_message", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_log_workspace_resource_idx").on(table.workspaceId, table.resourceType, table.resourceId),
  ],
);
