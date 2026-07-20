import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, wikiPageIndex, wikiPageSourceRef } from "@jarvis/db";
import { cleanWikiTables, createTempWikiRepo, insertSourceRevision, prepareDatabase } from "./helpers.js";
import { projectCurrentHead } from "../../lib/projection.js";

describe("wiki projection", () => {
  let workspaceId = "";

  beforeAll(async () => {
    workspaceId = await prepareDatabase();
  });

  afterAll(async () => {
    await cleanWikiTables(workspaceId);
  });

  it("projects body-free page index and source refs from committed Git", async () => {
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
            "",
            "본문은 DB에 저장하지 않는 projection 테스트입니다.",
          ].join("\n"),
        },
        message: `[ingest] source-revision:${revision.sourceRevisionId}`,
        author: { name: "jarvis-public-wiki-bot", email: "wiki-bot@example.invalid" },
      });

      const result = await projectCurrentHead({ workspaceId, repo: wiki.repo });
      expect(result.commitSha).toBe(commit.sha);
      const [page] = await db.select({
        id: wikiPageIndex.id,
        snippet: wikiPageIndex.snippet,
        gitSha: wikiPageIndex.gitSha,
      }).from(wikiPageIndex).where(and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.path, "auto/concepts/average-wage.md"),
      ));
      expect(page?.gitSha).toBe(commit.sha);
      expect(page?.snippet).toContain("projection 테스트");
      const refs = await db
        .select({ id: wikiPageSourceRef.id })
        .from(wikiPageSourceRef)
        .where(eq(wikiPageSourceRef.workspaceId, workspaceId));
      expect(refs).toHaveLength(1);
    } finally {
      await wiki.cleanup();
    }
  });
});
