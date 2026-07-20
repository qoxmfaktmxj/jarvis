import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createMinioObjectStoreFromEnv } from "@jarvis/storage";
import type PgBoss from "pg-boss";
import {
  DEMO_ACCOUNT_CLEANUP_QUEUE,
  SOURCE_INGEST_QUEUE,
  WIKI_LINT_QUEUE,
  WIKI_PROJECT_QUEUE,
  WIKI_RECONCILE_QUEUE,
  demoCleanupPayloadSchema,
  sourceIngestPayloadSchema,
  wikiIngestPayloadSchema,
  wikiLintPayloadSchema,
  wikiProjectPayloadSchema,
  wikiReconcilePayloadSchema,
} from "@jarvis/shared/queues/wiki";
import { createBoss } from "./lib/boss.js";
import { createWorkerWikiModel } from "./lib/wiki-model.js";
import { STATIC_WIKI_QUEUES, loadWikiRuntime, wikiIngestQueue } from "./lib/wiki-runtime.js";
import { cleanupDemoAccounts } from "./jobs/demo-account-cleanup.js";
import { enqueueReview, serializeError, type ReviewKind } from "./jobs/ingest/review-queue.js";
import { processWikiIngest } from "./jobs/ingest/index.js";
import { createSourceIngestService, type IngestSourceRevisionInput } from "./jobs/source-ingest.js";
import { lintWorkspace } from "./jobs/wiki-lint.js";
import { projectWikiJob } from "./jobs/wiki-project.js";
import { reconcileWorkspace } from "./jobs/wiki-reconcile.js";

type SourceJob = z.infer<typeof sourceIngestPayloadSchema>;
type WikiIngestJob = z.infer<typeof wikiIngestPayloadSchema>;
type WikiProjectJob = z.infer<typeof wikiProjectPayloadSchema>;
type WikiReconcileJob = z.infer<typeof wikiReconcilePayloadSchema>;
type WikiLintJob = z.infer<typeof wikiLintPayloadSchema>;
type DemoCleanupJob = z.infer<typeof demoCleanupPayloadSchema>;

function firstJobData<T extends object>(jobs: PgBoss.Job<T>[]): T {
  const job = jobs[0];
  if (!job) throw new Error("pg-boss delivered an empty batch");
  return job.data;
}

function requirePublicWorkspace(workspaceId: string, publicWorkspaceId: string): void {
  if (workspaceId !== publicWorkspaceId) {
    throw new Error("queue workspace does not match public workspace");
  }
}

async function recordFailure(input: {
  workspaceId: string;
  kind: ReviewKind;
  sourceRevisionId?: string | null;
  description: string;
  error: unknown;
}): Promise<void> {
  try {
    await enqueueReview({
      workspaceId: input.workspaceId,
      kind: input.kind,
      sourceRevisionId: input.sourceRevisionId,
      description: input.description,
      payload: { error: serializeError(input.error) },
    });
  } catch (reviewError) {
    console.error("[worker] failed to record review", serializeError(reviewError));
  }
}

export async function startWorker(
  env: Record<string, string | undefined> = process.env,
): Promise<PgBoss> {
  const runtime = await loadWikiRuntime(env);
  const objectStore = createMinioObjectStoreFromEnv(env);
  const ingestSource = createSourceIngestService(env);
  const model = createWorkerWikiModel(env);
  const boss = createBoss(env);
  const ingestQueue = wikiIngestQueue(runtime.workspaceId);

  try {
    await boss.start();
    for (const queue of [...STATIC_WIKI_QUEUES, ingestQueue]) {
      await boss.createQueue(queue);
    }

    await cleanupDemoAccounts();
    await boss.schedule(DEMO_ACCOUNT_CLEANUP_QUEUE, "0 * * * *", { workspaceId: runtime.workspaceId }, { tz: "Asia/Seoul" });
    await boss.schedule(WIKI_RECONCILE_QUEUE, "0 3 * * *", { workspaceId: runtime.workspaceId }, { tz: "Asia/Seoul" });
    await boss.schedule(WIKI_LINT_QUEUE, "0 4 * * *", { workspaceId: runtime.workspaceId }, { tz: "Asia/Seoul" });

    await boss.work(SOURCE_INGEST_QUEUE, { batchSize: 1 }, async (jobs: PgBoss.Job<SourceJob>[]) => {
      let sourceRevisionId: string | null = null;
      try {
        const data = sourceIngestPayloadSchema.parse(firstJobData(jobs));
        requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        const request: IngestSourceRevisionInput = {
          workspaceId: data.workspaceId,
          providerId: data.providerId,
          externalId: data.externalId,
          ...(data.retrievedAt ? { retrievedAt: new Date(data.retrievedAt) } : {}),
        };
        const result = await ingestSource(request);
        sourceRevisionId = result.sourceRevisionId;
        if (result.created) {
          const jobId = await boss.send(ingestQueue, {
            workspaceId: data.workspaceId,
            sourceRevisionId: result.sourceRevisionId,
          });
          if (!jobId) throw new Error("failed to enqueue wiki ingest");
        }
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "ingest_failure",
          sourceRevisionId,
          description: "source-ingest job failed",
          error,
        });
        throw error;
      }
    });

    await boss.work(ingestQueue, { batchSize: 1 }, async (jobs: PgBoss.Job<WikiIngestJob>[]) => {
      let data: WikiIngestJob | undefined;
      try {
        data = wikiIngestPayloadSchema.parse(firstJobData(jobs));
        requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        await processWikiIngest(data, {
          objectStore,
          model,
          repo: runtime.repo,
          workspaceCode: runtime.workspaceCode,
          boss,
        });
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "ingest_failure",
          sourceRevisionId: data?.sourceRevisionId ?? null,
          description: "wiki-ingest job failed",
          error,
        });
        throw error;
      }
    });

    await boss.work(WIKI_PROJECT_QUEUE, { batchSize: 1 }, async (jobs: PgBoss.Job<WikiProjectJob>[]) => {
      try {
        const data = wikiProjectPayloadSchema.parse(firstJobData(jobs));
        requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        await projectWikiJob(data, runtime.repo);
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "integrity_violation",
          description: "wiki-project job failed",
          error,
        });
        throw error;
      }
    });

    await boss.work(WIKI_RECONCILE_QUEUE, { batchSize: 1 }, async (jobs: PgBoss.Job<WikiReconcileJob>[]) => {
      try {
        const data = wikiReconcilePayloadSchema.parse(firstJobData(jobs));
        requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        await reconcileWorkspace(data.workspaceId, runtime.repo);
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "integrity_violation",
          description: "wiki-reconcile job failed",
          error,
        });
        throw error;
      }
    });

    await boss.work(WIKI_LINT_QUEUE, { batchSize: 1 }, async (jobs: PgBoss.Job<WikiLintJob>[]) => {
      try {
        const data = wikiLintPayloadSchema.parse(firstJobData(jobs));
        requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        await lintWorkspace({
          workspaceId: data.workspaceId,
          repo: runtime.repo,
          ...(data.reportDate ? { now: new Date(`${data.reportDate}T00:00:00.000Z`) } : {}),
        });
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "lint",
          description: "wiki-lint job failed",
          error,
        });
        throw error;
      }
    });

    await boss.work(DEMO_ACCOUNT_CLEANUP_QUEUE, { batchSize: 1 }, async (jobs: PgBoss.Job<DemoCleanupJob>[]) => {
      try {
        const data = demoCleanupPayloadSchema.parse(firstJobData(jobs));
        if (data.workspaceId) requirePublicWorkspace(data.workspaceId, runtime.workspaceId);
        await cleanupDemoAccounts(data.now ? new Date(data.now) : undefined);
      } catch (error) {
        await recordFailure({
          workspaceId: runtime.workspaceId,
          kind: "integrity_violation",
          description: "demo-account-cleanup job failed",
          error,
        });
        throw error;
      }
    });

    return boss;
  } catch (error) {
    try {
      await boss.stop();
    } catch (stopError) {
      console.error("[worker] pg-boss stop failed", serializeError(stopError));
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const boss = await startWorker();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await boss.stop();
  };
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) {
  void main().catch((error) => {
    console.error("[worker] startup failed", serializeError(error));
    process.exitCode = 1;
  });
}
