import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, wikiPageIndex } from "@jarvis/db";
import type PgBoss from "pg-boss";
import type { ImmutableObjectStore } from "@jarvis/storage";
import type { WikiCompletionClient } from "../ingest/analyze.js";
import { processWikiIngest } from "../ingest/index.js";
import { projectWikiJob } from "../wiki-project.js";
import { cleanWikiTables, createTempWikiRepo, insertSourceRevision, prepareDatabase, workspaceCode } from "./helpers.js";

describe("worker ingest pipeline", () => {
  let workspaceId = "";

  beforeAll(async () => {
    workspaceId = await prepareDatabase();
  });

  afterAll(async () => {
    await cleanWikiTables(workspaceId);
  });

  it("commits generated pages and rebuilds projection from Git", async () => {
    const wiki = await createTempWikiRepo();
    try {
      const revision = await insertSourceRevision({ workspaceId });
      const objectStore: Pick<ImmutableObjectStore, "getText"> = {
        async getText(key) {
          expect(key).toBe(revision.normalizedObjectKey);
          return "평균임금 산정에 관한 합성 공개 예제입니다.";
        },
      };
      const model: WikiCompletionClient = {
        async complete(input) {
          if (input.purpose === "wiki-analyze") {
            return JSON.stringify({
              title: input.sourceTitle,
              pageType: "source",
              findings: [{
                claim: "평균임금 합성 근거",
                sourceRevisionId: input.sourceRevisionId,
                locator: "document",
                effectiveDate: input.effectiveDate,
                confidence: 1,
              }],
              contradictions: [],
              proposedLinks: [],
            });
          }
          return [
            "---FILE: auto/concepts/average-wage.md---",
            "---",
            'title: "평균임금"',
            "slug: average-wage",
            "pageType: concept",
            "publishedStatus: draft",
            "sources:",
            `  - sourceRevisionId: ${input.sourceRevisionId}`,
            "    locator: document",
            "    effectiveDate: 2026-07-20",
            "    confidence: 1",
            "aliases: []",
            "tags: [synthetic]",
            "created: 2026-07-20T00:00:00.000Z",
            "updated: 2026-07-20T00:00:00.000Z",
            "---",
            "# 평균임금",
            "",
            "평균임금 합성 예제입니다.",
            "---END FILE---",
          ].join("\n");
        },
      };
      const sent: Array<{ queue: string; data: unknown }> = [];
      const boss: Pick<PgBoss, "send"> = {
        send: (async (...args: unknown[]) => {
          const [queue, data] = args as [string, unknown];
          sent.push({ queue, data });
          return "job-1";
        }) as PgBoss["send"],
      };
      const result = await processWikiIngest(
        { workspaceId, sourceRevisionId: revision.sourceRevisionId },
        {
          objectStore: objectStore as ImmutableObjectStore,
          model,
          repo: wiki.repo,
          workspaceCode: await workspaceCode(workspaceId),
          boss,
        },
      );

      expect(await wiki.repo.readBlob(result.commitSha, "auto/concepts/average-wage.md")).toContain("평균임금");
      expect(sent).toEqual([{ queue: "wiki-project", data: {
        workspaceId,
        commitSha: result.commitSha,
        sourceRevisionId: revision.sourceRevisionId,
      } }]);

      await projectWikiJob({ workspaceId, commitSha: result.commitSha }, wiki.repo);
      const [page] = await db.select({ gitSha: wikiPageIndex.gitSha })
        .from(wikiPageIndex)
        .where(and(
          eq(wikiPageIndex.workspaceId, workspaceId),
          eq(wikiPageIndex.path, "auto/concepts/average-wage.md"),
        ));
      expect(page?.gitSha).toBe(result.commitSha);
    } finally {
      await wiki.cleanup();
    }
  });

  it("serializes concurrent commit/projection/review stages per workspace", async () => {
    const wiki = await createTempWikiRepo();
    try {
      const first = await insertSourceRevision({
        workspaceId,
        title: "합성 평균임금 A",
        normalizedObjectKey: "sources/concurrent/a.txt",
      });
      const second = await insertSourceRevision({
        workspaceId,
        title: "합성 평균임금 B",
        normalizedObjectKey: "sources/concurrent/b.txt",
      });
      const objectStore: Pick<ImmutableObjectStore, "getText"> = {
        async getText(key) {
          return `동시성 검증 원문 ${key}`;
        },
      };
      const model: WikiCompletionClient = {
        async complete(input) {
          if (input.purpose === "wiki-analyze") {
            return JSON.stringify({
              title: input.sourceTitle,
              pageType: "source",
              findings: [{
                claim: `${input.sourceTitle} 근거`,
                sourceRevisionId: input.sourceRevisionId,
                locator: "document",
                effectiveDate: input.effectiveDate,
                confidence: 1,
              }],
              contradictions: [],
              proposedLinks: [],
            });
          }
          const suffix = input.sourceTitle.endsWith("A") ? "a" : "b";
          return [
            `---FILE: auto/concepts/concurrent-${suffix}.md---`,
            "---",
            `title: "${input.sourceTitle}"`,
            `slug: concurrent-${suffix}`,
            "pageType: concept",
            "publishedStatus: draft",
            "sources:",
            `  - sourceRevisionId: ${input.sourceRevisionId}`,
            "    locator: document",
            "    effectiveDate: 2026-07-20",
            "    confidence: 1",
            "aliases: []",
            "tags: [synthetic]",
            "created: 2026-07-20T00:00:00.000Z",
            "updated: 2026-07-20T00:00:00.000Z",
            "---",
            `# ${input.sourceTitle}`,
            "",
            "동시성 검증 페이지입니다.",
            "---END FILE---",
          ].join("\n");
        },
      };
      const events: Array<{ sourceRevisionId: string; stage: string }> = [];
      const deps = {
        objectStore: objectStore as ImmutableObjectStore,
        model,
        repo: wiki.repo,
        workspaceCode: await workspaceCode(workspaceId),
        boss: {
          async send() {
            return "job-1";
          },
        } as never,
        onLockedEvent(event: { sourceRevisionId: string; stage: "begin" | "commit" | "projection" | "reviews" }) {
          events.push(event);
        },
      };

      await Promise.all([
        processWikiIngest({ workspaceId, sourceRevisionId: first.sourceRevisionId }, deps),
        processWikiIngest({ workspaceId, sourceRevisionId: second.sourceRevisionId }, deps),
      ]);

      const firstEvents = events.filter((event) => event.sourceRevisionId === first.sourceRevisionId);
      const secondEvents = events.filter((event) => event.sourceRevisionId === second.sourceRevisionId);
      const stages = ["begin", "commit", "projection", "reviews"];
      expect(firstEvents.map((event) => event.stage)).toEqual(stages);
      expect(secondEvents.map((event) => event.stage)).toEqual(stages);
      const firstIndexes = firstEvents.map((event) => events.indexOf(event));
      const secondIndexes = secondEvents.map((event) => events.indexOf(event));
      const firstBeforeSecond = Math.max(...firstIndexes) < Math.min(...secondIndexes);
      const secondBeforeFirst = Math.max(...secondIndexes) < Math.min(...firstIndexes);
      expect(firstBeforeSecond || secondBeforeFirst).toBe(true);
    } finally {
      await wiki.cleanup();
    }
  });
});
