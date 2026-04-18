import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://jarvis:jarvispass@localhost:5432/jarvis";

const globalForDb = globalThis as typeof globalThis & {
  __jarvisDbPool__?: Pool;
};

const pool =
  globalForDb.__jarvisDbPool__ ??
  new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForDb.__jarvisDbPool__ = pool;
}

export const db = drizzle(pool, {
  schema,
  logger: process.env["NODE_ENV"] === "development"
});

export type DB = typeof db;
export { pool, schema, sql };
