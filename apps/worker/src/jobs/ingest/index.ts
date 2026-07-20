import PgBoss from "pg-boss";
import { and, eq } from "drizzle-orm";
import { db, sourceDocument, sourceRevision, wikiPageIndex } from "@jarvis/db";
import type { ImmutableObjectStore } from "@jarvis/storage";
import { type GitRepo } from "@jarvis/wiki-fs";
import { WIKI_PROJECT_QUEUE, type WikiProjectPayload } from "@jarvis/shared/queues/wiki";
import { analyzeRevision, type WikiCompletionClient } from "./analyze.js";
import { generatePages } from "./generate.js";
import { enqueueReviewInTx } from "./review-queue.js";
import { commitGeneratedPagesInTx } from "./write-and-commit.js";
import { projectCurrentHeadInTx } from "../../lib/projection.js";
import { withWorkspaceSingleWriter } from "../../lib/single-writer.js";

export interface WikiIngestPayload {
  workspaceId: string;
  sourceRevisionId: string;
}

export async function processWikiIngest(
  payload: WikiIngestPayload,
  deps: {
    objectStore: ImmutableObjectStore;
    model: WikiCompletionClient;
    repo: GitRepo;
    workspaceCode: string;
    boss: Pick<PgBoss, "send">;
    onLockedEvent?: (event: {
      sourceRevisionId: string;
      stage: "begin" | "commit" | "projection" | "reviews";
    }) => void;
  },
): Promise<{ commitSha: string }> {
  const [revision] = await db
    .select({
      id: sourceRevision.id,
      normalizedObjectKey: sourceRevision.normalizedObjectKey,
      effectiveFrom: sourceRevision.effectiveFrom,
      title: sourceDocument.title,
    })
    .from(sourceRevision)
    .innerJoin(
      sourceDocument,
      and(
        eq(sourceDocument.id, sourceRevision.sourceDocumentId),
        eq(sourceDocument.workspaceId, payload.workspaceId),
      ),
    )
    .where(
      and(
        eq(sourceRevision.id, payload.sourceRevisionId),
        eq(sourceRevision.workspaceId, payload.workspaceId),
      ),
    )
    .limit(1);

  if (!revision) throw new Error("source revision not found in workspace");

  const normalizedText = await deps.objectStore.getText(revision.normalizedObjectKey);
  const existingPages = await db
    .select({
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      summary: wikiPageIndex.snippet,
    })
    .from(wikiPageIndex)
    .where(eq(wikiPageIndex.workspaceId, payload.workspaceId));
  const effectiveDate = revision.effectiveFrom ? revision.effectiveFrom.toISOString().slice(0, 10) : null;

  const analysis = await analyzeRevision(
    {
      sourceRevisionId: revision.id,
      sourceTitle: revision.title,
      effectiveDate,
      normalizedText,
      existingPages,
    },
    deps.model,
  );
  const generation = await generatePages(
    {
      sourceRevisionId: revision.id,
      sourceTitle: revision.title,
      effectiveDate,
      normalizedText,
      existingPages,
      analysis,
    },
    deps.model,
  );
  return withWorkspaceSingleWriter(payload.workspaceId, async (tx) => {
    deps.onLockedEvent?.({ sourceRevisionId: payload.sourceRevisionId, stage: "begin" });
    const [lockedRevision] = await tx
      .select({ id: sourceRevision.id })
      .from(sourceRevision)
      .where(and(
        eq(sourceRevision.id, payload.sourceRevisionId),
        eq(sourceRevision.workspaceId, payload.workspaceId),
      ))
      .limit(1);
    if (!lockedRevision) throw new Error("source revision not found in workspace");

    await tx
      .select({ path: wikiPageIndex.path })
      .from(wikiPageIndex)
      .where(eq(wikiPageIndex.workspaceId, payload.workspaceId));

    const commit = await commitGeneratedPagesInTx({
      workspaceId: payload.workspaceId,
      workspaceCode: deps.workspaceCode,
      sourceRevisionId: revision.id,
      files: generation.files,
      repo: deps.repo,
    }, tx);
    deps.onLockedEvent?.({ sourceRevisionId: payload.sourceRevisionId, stage: "commit" });

    await projectCurrentHeadInTx({ workspaceId: payload.workspaceId, repo: deps.repo }, tx);
    deps.onLockedEvent?.({ sourceRevisionId: payload.sourceRevisionId, stage: "projection" });

    for (const contradiction of analysis.contradictions) {
      await enqueueReviewInTx({
        workspaceId: payload.workspaceId,
        kind: "contradiction",
        sourceRevisionId: revision.id,
        affectedPages: analysis.proposedLinks,
        commitSha: commit.commitSha,
        description: contradiction.reason,
        payload: { claim: contradiction.claim, revisionIds: contradiction.revisionIds },
      }, tx);
    }
    for (const review of generation.reviews) {
      await enqueueReviewInTx({
        workspaceId: payload.workspaceId,
        kind: review.type === "contradiction" ? "contradiction" : "citation_validation",
        sourceRevisionId: payload.sourceRevisionId,
        affectedPages: review.pages,
        commitSha: commit.commitSha,
        description: `${review.title}: ${review.body}`,
        payload: {
          options: review.options,
          pages: review.pages,
          search: review.search,
        },
      }, tx);
    }
    deps.onLockedEvent?.({ sourceRevisionId: payload.sourceRevisionId, stage: "reviews" });

    const projectPayload: WikiProjectPayload = {
      workspaceId: payload.workspaceId,
      commitSha: commit.commitSha,
      sourceRevisionId: payload.sourceRevisionId,
    };
    const jobId = await deps.boss.send(WIKI_PROJECT_QUEUE, projectPayload);
    if (!jobId) throw new Error("failed to enqueue wiki-project");

    return { commitSha: commit.commitSha };
  });
}
