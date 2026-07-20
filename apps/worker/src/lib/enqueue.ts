import type PgBoss from "pg-boss";
import { WIKI_PROJECT_QUEUE } from "@jarvis/shared/queues/wiki";
import { createBoss } from "./boss.js";

export async function enqueueWikiProject(input: {
  workspaceId: string;
  commitSha: string;
  sourceRevisionId?: string | null;
  boss?: Pick<PgBoss, "send">;
  env?: Record<string, string | undefined>;
}): Promise<string> {
  const payload = {
    workspaceId: input.workspaceId,
    commitSha: input.commitSha,
    sourceRevisionId: input.sourceRevisionId ?? null,
  };

  if (input.boss) {
    const jobId = await input.boss.send(WIKI_PROJECT_QUEUE, payload);
    if (!jobId) throw new Error("PROJECT_ENQUEUE_FAILED");
    return jobId;
  }

  const boss = createBoss(input.env);
  await boss.start();
  try {
    const jobId = await boss.send(WIKI_PROJECT_QUEUE, payload);
    if (!jobId) throw new Error("PROJECT_ENQUEUE_FAILED");
    return jobId;
  } finally {
    await boss.stop();
  }
}
