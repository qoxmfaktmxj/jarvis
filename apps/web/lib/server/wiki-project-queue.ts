import "server-only";

import PgBoss from "pg-boss";
import { WIKI_PROJECT_QUEUE, wikiProjectPayloadSchema } from "@jarvis/shared/queues/wiki";

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }
  return value;
}

export async function enqueueWikiProject(input: { workspaceId: string; commitSha: string }): Promise<string> {
  const payload = wikiProjectPayloadSchema.parse(input);
  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  await boss.start();
  try {
    const jobId = await boss.send(WIKI_PROJECT_QUEUE, payload);
    if (!jobId) {
      throw new Error("PROJECT_ENQUEUE_FAILED");
    }
    return jobId;
  } finally {
    await boss.stop();
  }
}
