import { db } from "@jarvis/db";
import { sql } from "drizzle-orm";

export type LockedDbExecutor = typeof db;

export async function withWorkspaceSingleWriter<T>(
  workspaceId: string,
  operation: (tx: LockedDbExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (lockTx) => {
    await lockTx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`jarvis-public-wiki:${workspaceId}`}, 0)
      )
    `);
    return operation(lockTx as unknown as typeof db);
  });
}
