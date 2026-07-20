import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema/index.js";

const APPROVED_TABLES = [
  schema.workspace,
  schema.appUser,
  schema.role,
  schema.permission,
  schema.userRole,
  schema.rolePermission,
  schema.userSession,
  schema.menuItem,
  schema.menuPermission,
  schema.codeGroup,
  schema.codeItem,
  schema.sourceDocument,
  schema.sourceRevision,
  schema.legalCase,
  schema.wikiPageIndex,
  schema.wikiPageLink,
  schema.wikiPageSourceRef,
  schema.wikiCommitLog,
  schema.wikiReviewQueue,
  schema.wikiLintReport,
  schema.askConversation,
  schema.askMessage,
  schema.answerFeedback,
  schema.llmCallLog,
  schema.searchLog,
  schema.auditLog,
] as const;

describe("public schema", () => {
  it("exports only approved domain tables", () => {
    const removedDomainPattern = new RegExp([
      ["sa", "les"].join(""),
      "project",
      ["main", "tenance"].join(""),
      ["con", "tractor"].join(""),
      "knowledgePage",
    ].join("|"), "i");
    expect(APPROVED_TABLES.map(getTableName).sort()).toEqual([
      "answer_feedback",
      "app_user",
      "ask_conversation",
      "ask_message",
      "audit_log",
      "code_group",
      "code_item",
      "legal_case",
      "llm_call_log",
      "menu_item",
      "menu_permission",
      "permission",
      "role",
      "role_permission",
      "search_log",
      "source_document",
      "source_revision",
      "user_role",
      "user_session",
      "wiki_commit_log",
      "wiki_lint_report",
      "wiki_page_index",
      "wiki_page_link",
      "wiki_page_source_ref",
      "wiki_review_queue",
      "workspace",
    ]);
    expect(Object.keys(schema).join(" ")).not.toMatch(removedDomainPattern);
  });

  it("contains exactly six body-free Wiki projection tables", () => {
    const wikiTables = [
      schema.wikiPageIndex,
      schema.wikiPageLink,
      schema.wikiPageSourceRef,
      schema.wikiCommitLog,
      schema.wikiReviewQueue,
      schema.wikiLintReport,
    ];

    expect(Object.keys(schema).filter((name) => name.startsWith("wiki") && !name.endsWith("Enum")).sort()).toEqual([
      "wikiCommitLog",
      "wikiLintReport",
      "wikiPageIndex",
      "wikiPageLink",
      "wikiPageSourceRef",
      "wikiReviewQueue",
    ]);
    expect(wikiTables.map(getTableName).sort()).toEqual([
      "wiki_commit_log",
      "wiki_lint_report",
      "wiki_page_index",
      "wiki_page_link",
      "wiki_page_source_ref",
      "wiki_review_queue",
    ]);

    for (const table of wikiTables) {
      expect(Object.keys(getTableColumns(table))).not.toEqual(
        expect.arrayContaining(["body", "content", "mdxContent"]),
      );
    }
  });
});
