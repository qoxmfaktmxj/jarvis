import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectCurrentHead } from "./lib/projection.js";
import { loadWikiRuntime } from "./lib/wiki-runtime.js";
import { serializeError } from "./jobs/ingest/review-queue.js";

export async function projectOnce(
  env: Record<string, string | undefined> = process.env,
): Promise<{ commitSha: string; paths: string[] }> {
  const runtime = await loadWikiRuntime(env);
  await runtime.repo.createRepo("main");
  return projectCurrentHead({
    workspaceId: runtime.workspaceId,
    repo: runtime.repo,
  });
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) {
  void projectOnce()
    .then((result) => {
      console.log(JSON.stringify({
        commitSha: result.commitSha,
        projectedPageCount: result.paths.length,
      }));
    })
    .catch((error) => {
      console.error("[wiki-project-once]", serializeError(error));
      process.exitCode = 1;
    });
}
