import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertFileIsRegular, readJsonFile } from "./fs-utils.js";
import { syncWikiSamples } from "./init-wiki.js";

export async function main(): Promise<void> {
  const statePath = join(process.cwd(), ".runtime", "sample-ingest-state.json");
  await assertFileIsRegular(statePath, "sample ingest state");
  const state = await readJsonFile<Record<string, { sourceRevisionId: string }>>(statePath);
  await syncWikiSamples({
    samplesRoot: join(process.cwd(), "samples", "wiki"),
    runtimeRoot: join(process.cwd(), ".runtime", "wiki-repo"),
    sourceRevisionIds: Object.fromEntries(
      Object.entries(state).map(([key, value]) => [key, value.sourceRevisionId]),
    ),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "sample Wiki sync failed");
    process.exitCode = 1;
  });
}
