import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, wikiCommitLog, wikiPageIndex, wikiPageLink, wikiPageSourceRef } from "@jarvis/db";
import { cleanWikiTables, createTempWikiRepo, insertSourceRevision, prepareDatabase } from "./helpers.js";
import { projectCurrentHead } from "../../lib/projection.js";
import { reconcileWorkspace } from "../wiki-reconcile.js";

describe("wiki reconcile", () => {
  let workspaceId = "";

  beforeAll(async () => {
    workspaceId = await prepareDatabase();
  });

  afterAll(async () => {
    await cleanWikiTables(workspaceId);
  });

  it("rebuilds projection rows after projection tables are truncated", async () => {
    const wiki = await createTempWikiRepo();
    try {
      const revision = await insertSourceRevision({ workspaceId });
      const commit = await wiki.repo.writeAndCommit({
        actor: "system",
        files: {
          "auto/concepts/average-wage.md": [
            "---",
            'title: "평균임금"',
            "slug: average-wage",
            "pageType: concept",
            "publishedStatus: draft",
            "sources:",
            `  - sourceRevisionId: ${revision.sourceRevisionId}`,
            "    locator: document",
            "    effectiveDate: 2026-07-20",
            "    confidence: 1",
            "aliases: []",
            "tags: []",
            "created: 2026-07-20T00:00:00.000Z",
            "updated: 2026-07-20T00:00:00.000Z",
            "---",
            "# 평균임금",
          ].join("\n"),
        },
        message: `[ingest] source-revision:${revision.sourceRevisionId}`,
        author: { name: "jarvis-public-wiki-bot", email: "wiki-bot@example.invalid" },
      });
      await projectCurrentHead({ workspaceId, repo: wiki.repo });
      await db.delete(wikiPageLink).where(eq(wikiPageLink.workspaceId, workspaceId));
      await db.delete(wikiPageSourceRef).where(eq(wikiPageSourceRef.workspaceId, workspaceId));
      await db.delete(wikiPageIndex).where(eq(wikiPageIndex.workspaceId, workspaceId));
      await db.delete(wikiCommitLog).where(eq(wikiCommitLog.workspaceId, workspaceId));

      await reconcileWorkspace(workspaceId, wiki.repo);
      const [page] = await db.select({ gitSha: wikiPageIndex.gitSha })
        .from(wikiPageIndex)
        .where(and(
          eq(wikiPageIndex.workspaceId, workspaceId),
          eq(wikiPageIndex.path, "auto/concepts/average-wage.md"),
        ));
      expect(page?.gitSha).toBe(commit.sha);
    } finally {
      await wiki.cleanup();
    }
  });
});
