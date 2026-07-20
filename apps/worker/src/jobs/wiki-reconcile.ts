import type { GitRepo } from "@jarvis/wiki-fs";
import { projectCurrentHead } from "../lib/projection.js";

export async function reconcileWorkspace(
  workspaceId: string,
  repo: GitRepo,
): Promise<{ commitSha: string; paths: string[] }> {
  return projectCurrentHead({ workspaceId, repo });
}
