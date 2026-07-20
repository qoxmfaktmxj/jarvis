import { pathToFileURL } from "node:url";
import { dataSync } from "./setup-local.js";

export { dataSync } from "./setup-local.js";

export async function main(): Promise<void> {
  await dataSync();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "data-sync failed");
    process.exitCode = 1;
  });
}
