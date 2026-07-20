import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = (
    env.NODE_ENV === "test" ? env.TEST_DATABASE_URL?.trim() : undefined
  ) || env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required (or TEST_DATABASE_URL while NODE_ENV=test)");
  }
  return value;
}

export const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  max: 10,
});

export const db = drizzle(pool, { schema });
