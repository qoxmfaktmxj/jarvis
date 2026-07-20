import type { GitRepo } from "@jarvis/wiki-fs";
import { projectCurrentHead } from "../lib/projection.js";

export async function projectWikiJob(
  payload: { workspaceId: string; commitSha: string },
  repo: GitRepo,
): Promise<{ commitSha: string; paths: string[] }> {
  if (!/^[0-9a-f]{40}$/i.test(payload.commitSha)) throw new Error("invalid wiki-project commitSha");
  return projectCurrentHead({
    workspaceId: payload.workspaceId,
    repo,
  });
}
