import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, migrate, pool, seedSystem, sourceDocument, sourceRevision, workspace } from "@jarvis/db";
import { GitRepo } from "@jarvis/wiki-fs";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export async function prepareDatabase(): Promise<string> {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for worker integration tests");
  }
  await migrate(pool, resolve(process.cwd(), "../../packages/db/migrations"));
  await seedSystem(pool);
  const [row] = await db
    .insert(workspace)
    .values({
      code: `worker-test-${randomUUID()}`,
      name: "Worker integration test",
      settings: { synthetic: true },
    })
    .returning({ id: workspace.id });
  if (!row) throw new Error("worker test workspace insert failed");
  return row.id;
}

export async function cleanWikiTables(workspaceId: string): Promise<void> {
  await db.delete(workspace).where(eq(workspace.id, workspaceId));
}

export async function createTempWikiRepo(): Promise<{
  repo: GitRepo;
  repoRoot: string;
  cleanup: () => Promise<void>;
}> {
  const testRoot = resolve(process.cwd(), "../../.runtime/worker-tests");
  await mkdir(testRoot, { recursive: true });
  const repoRoot = await mkdtemp(join(testRoot, "wiki-"));
  const repo = new GitRepo(repoRoot);
  await repo.createRepo();
  return {
    repo,
    repoRoot,
    cleanup: () => rm(repoRoot, { recursive: true, force: true }),
  };
}

export async function insertSourceRevision(input: {
  workspaceId: string;
  title?: string;
  normalizedObjectKey?: string;
}): Promise<{ sourceDocumentId: string; sourceRevisionId: string; title: string; normalizedObjectKey: string }> {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const title = input.title ?? "합성 평균임금 안내";
  const normalizedObjectKey = input.normalizedObjectKey ?? `sources/${randomUUID()}/normalized.txt`;
  const [document] = await db.insert(sourceDocument).values({
    workspaceId: input.workspaceId,
    provider: "fake",
    sourceType: "guide",
    externalId: `test-${randomUUID()}`,
    title,
    canonicalUrl: "https://example.invalid/hr/average-wage",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }).returning({ id: sourceDocument.id });
  if (!document) throw new Error("source document insert failed");

  const [revision] = await db.insert(sourceRevision).values({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    revisionKey: `rev-${randomUUID()}`,
    publishedAt: now,
    effectiveFrom: now,
    effectiveTo: null,
    retrievedAt: now,
    checksumSha256: "a".repeat(64),
    rawObjectKey: `sources/${document.id}/raw.txt`,
    normalizedObjectKey,
    mimeType: "text/plain",
    sizeBytes: 42,
    parseStatus: "parsed",
    metadata: {},
    createdAt: now,
  }).returning({ id: sourceRevision.id });
  if (!revision) throw new Error("source revision insert failed");

  return {
    sourceDocumentId: document.id,
    sourceRevisionId: revision.id,
    title,
    normalizedObjectKey,
  };
}

export async function workspaceCode(workspaceId: string): Promise<string> {
  const [row] = await db.select({ code: workspace.code }).from(workspace).where(eq(workspace.id, workspaceId));
  if (!row) throw new Error(`workspace not found: ${workspaceId}`);
  return row.code;
}
