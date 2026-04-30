/**
 * Programmatic migration runner.
 *
 * Usage: pnpm db:migrate  (runs via "tsx migrate.ts")
 *
 * Why not `drizzle-kit migrate` directly?
 * drizzle-kit evaluates drizzle.config.ts with a CWD that doesn't always
 * resolve to the project root on Windows/pnpm, so DATABASE_URL may not be
 * picked up. This script uses client.ts (which already handles env loading)
 * and the drizzle-orm programmatic migrator instead.
 *
 * Extensions: docker-entrypoint-initdb.d only runs on first container init.
 * This script idempotently creates required extensions so a fresh schema
 * (e.g. after DROP SCHEMA public CASCADE in dev) always works.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });
loadEnv(); // fallback: system env

console.log("[migrate] DATABASE_URL:", process.env["DATABASE_URL"] ?? "(fallback default)");

const { db, pool } = await import("./client.js");

// Extensions live at the database level; re-creating them is a no-op.
// Must run before migrations because 0000 creates a table with vector(1536).
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "vector"`);
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "unaccent"`);

await migrate(db, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
console.log("[migrate] All migrations applied successfully.");

await pool.end();
