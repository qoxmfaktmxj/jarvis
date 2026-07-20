import { isAbsolute, parse, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, PUBLIC_WORKSPACE_CODE, workspace } from "@jarvis/db";
import { GitRepo } from "@jarvis/wiki-fs";
import {
  DEMO_ACCOUNT_CLEANUP_QUEUE,
  SOURCE_INGEST_QUEUE,
  WIKI_LINT_QUEUE,
  WIKI_PROJECT_QUEUE,
  WIKI_RECONCILE_QUEUE,
  wikiIngestQueueName,
} from "@jarvis/shared/queues/wiki";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STATIC_WIKI_QUEUES = [
  SOURCE_INGEST_QUEUE,
  WIKI_PROJECT_QUEUE,
  WIKI_RECONCILE_QUEUE,
  WIKI_LINT_QUEUE,
  DEMO_ACCOUNT_CLEANUP_QUEUE,
] as const;

export function wikiIngestQueue(workspaceId: string): string {
  if (!UUID.test(workspaceId)) throw new Error("invalid workspaceId");
  return wikiIngestQueueName(workspaceId);
}

export function createWikiRepo(
  env: Record<string, string | undefined> = process.env,
): GitRepo {
  const configured = env.WIKI_REPO_ROOT?.trim();
  if (!configured) throw new Error("WIKI_REPO_ROOT is required");
  if (!isAbsolute(configured)) throw new Error("WIKI_REPO_ROOT must be absolute");
  const repoRoot = resolve(configured);
  if (repoRoot === parse(repoRoot).root) {
    throw new Error("WIKI_REPO_ROOT must not be a filesystem root");
  }
  return new GitRepo(repoRoot);
}

export async function loadWikiRuntime(
  env: Record<string, string | undefined> = process.env,
): Promise<{ workspaceId: string; workspaceCode: string; repo: GitRepo }> {
  const [publicWorkspace] = await db
    .select({ id: workspace.id, code: workspace.code })
    .from(workspace)
    .where(eq(workspace.code, PUBLIC_WORKSPACE_CODE))
    .limit(1);
  if (!publicWorkspace) {
    throw new Error("public-demo workspace is not seeded");
  }
  return {
    workspaceId: publicWorkspace.id,
    workspaceCode: publicWorkspace.code,
    repo: createWikiRepo(env),
  };
}
