import { pathToFileURL } from "node:url";
import { pool } from "../client.js";
import { PUBLIC_WORKSPACE_CODE, seedSystem } from "./system.js";

export { PUBLIC_WORKSPACE_CODE, seedSystem };

export async function runSeedCli(): Promise<void> {
  try {
    await seedSystem(pool);
    process.stdout.write("db:seed: complete\n");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeedCli().catch(() => {
    process.stderr.write("db:seed: failed\n");
    process.exitCode = 1;
  });
}
