import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "@jarvis/db";
import { seedSystem } from "@jarvis/db";
import { db } from "@jarvis/db";
import { appUser, role, userRole, userSession } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "../password.js";
import { createSession, getSession, hashOpaqueSessionId, rotateSession } from "../session.js";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
}

const testPool = new Pool({ connectionString, max: 2 });
const migrationsDir = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));

let userId = "";
const runId = randomUUID();

beforeAll(async () => {
  await migrate(testPool, migrationsDir);
  const { workspaceId } = await seedSystem(testPool);
  const [adminRole] = await db
    .select({ id: role.id })
    .from(role)
    .where(and(eq(role.workspaceId, workspaceId), eq(role.code, "ADMIN")))
    .limit(1);
  const [user] = await db
    .insert(appUser)
    .values({
      workspaceId,
      email: `admin-${runId}@example.invalid`,
      displayName: "Admin",
      passwordHash: await hashPassword("jarvispublic2026"),
      status: "active",
      accountType: "human",
      preferences: {},
    })
    .returning({ id: appUser.id });
  await db.insert(userRole).values({
    workspaceId,
    userId: user.id,
    roleId: adminRole.id,
  });
  userId = user.id;
});

describe("session integration", () => {
  it("creates, loads, and rotates a session", async () => {
    const issued = await createSession({ userId, now: new Date("2026-07-20T00:00:00.000Z") });
    const [stored] = await db
      .select({ tokenHash: userSession.sessionTokenHash })
      .from(userSession)
      .where(eq(userSession.userId, userId))
      .limit(1);
    expect(stored?.tokenHash).toBe(hashOpaqueSessionId(issued.sessionId));
    expect(stored?.tokenHash).not.toBe(issued.sessionId);

    const loaded = await getSession(issued.sessionId, new Date("2026-07-20T00:01:00.000Z"));
    expect(loaded?.userId).toBe(userId);

    const rotated = await rotateSession({
      currentSessionId: issued.sessionId,
      userId,
      now: new Date("2026-07-20T00:02:00.000Z"),
    });
    expect(rotated.sessionId).not.toBe(issued.sessionId);
    await expect(getSession(issued.sessionId, new Date("2026-07-20T00:02:01.000Z"))).resolves.toBeNull();
  });
});

afterAll(async () => {
  if (userId) {
    await db.delete(appUser).where(eq(appUser.id, userId));
  }
  await testPool.end();
});
