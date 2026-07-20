import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { db, migrate, seedSystem } from "@jarvis/db";
import { appUser, role, userRole, workspace } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { cleanupExpiredDemoAccounts, createDemoSession } from "../demo.js";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
}

const testPool = new Pool({ connectionString, max: 2 });
const migrationsDir = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
const runId = randomUUID();

beforeAll(async () => {
  await migrate(testPool, migrationsDir);
  await seedSystem(testPool);
});

async function roleOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: role.code })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, userId))
    .limit(1);
  return row?.code ?? null;
}

describe("demo integration", () => {
  it("creates a READER demo session with expected expiry", async () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const demo = await createDemoSession({ now, ttlMs: 60_000 });
    expect(demo.expiresAt.getTime()).toBe(now.getTime() + 60_000);
    expect(await roleOf(demo.userId)).toBe("READER");
  });

  it("cleans up expired demo accounts", async () => {
    const [tenant] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.code, "public-demo")).limit(1);
    const [expired] = await db
    .insert(appUser)
    .values({
      workspaceId: tenant.id,
      email: `expired-demo-${runId}@example.invalid`,
      displayName: "Expired Demo",
        passwordHash: null,
        status: "active",
        accountType: "demo",
        expiresAt: new Date("2026-07-20T00:00:00.000Z"),
        preferences: {},
      })
      .returning({ id: appUser.id });
    const [readerRole] = await db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.workspaceId, tenant.id), eq(role.code, "READER")))
      .limit(1);
    await db.insert(userRole).values({
      workspaceId: tenant.id,
      userId: expired.id,
      roleId: readerRole.id,
    });

    await expect(cleanupExpiredDemoAccounts({ now: new Date("2026-07-20T00:01:00.000Z") })).resolves.toBeGreaterThanOrEqual(1);
  });
});

afterAll(async () => {
  await testPool.end();
});
