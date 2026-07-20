import { fileURLToPath } from "node:url";
import { pool } from "./client.js";
import { migrate } from "./migrate.js";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

try {
  await migrate(pool, migrationsDir);
  process.stdout.write("db:migrate: complete\n");
} catch {
  process.stderr.write("db:migrate: failed\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
