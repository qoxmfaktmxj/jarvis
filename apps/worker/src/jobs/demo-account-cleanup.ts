import { and, eq, lte } from "drizzle-orm";
import { appUser, db } from "@jarvis/db";

export async function cleanupDemoAccounts(now = new Date()): Promise<number> {
  const expired = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.accountType, "demo"), lte(appUser.expiresAt, now)));
  if (expired.length === 0) return 0;

  const deleted = await db
    .delete(appUser)
    .where(and(eq(appUser.accountType, "demo"), lte(appUser.expiresAt, now)))
    .returning({ id: appUser.id });
  return deleted.length;
}
