import { fileURLToPath } from "node:url";
import { pool } from "./client.js";
import { migrate } from "./migrate.js";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

try {
  await migrate(pool, migrationsDir);
  process.stdout.write("db:migrate: complete\n");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`db:migrate: failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
