import { randomBytes } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, PUBLIC_WORKSPACE_CODE } from "@jarvis/db";
import { appUser, role, userRole, userSession, workspace } from "@jarvis/db/schema";
import { createDemoSessionInput } from "@jarvis/shared/validation/auth";
import { hashOpaqueSessionId } from "./session.js";

export async function createDemoSession(raw: unknown): Promise<{
  sessionId: string;
  expiresAt: Date;
  userId: string;
}> {
  const input = createDemoSessionInput.parse(raw);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs);
  const sessionId = randomBytes(32).toString("hex");

  return db.transaction(async (tx) => {
    const [tenant] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.code, PUBLIC_WORKSPACE_CODE)).limit(1);
    if (!tenant) {
      throw new Error("PUBLIC_WORKSPACE_MISSING");
    }

    await tx
      .delete(appUser)
      .where(and(eq(appUser.workspaceId, tenant.id), eq(appUser.accountType, "demo"), lte(appUser.expiresAt, now)));

    const [reader] = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.workspaceId, tenant.id), eq(role.code, "READER")))
      .limit(1);
    if (!reader) {
      throw new Error("READER_ROLE_MISSING");
    }

    const [user] = await tx
      .insert(appUser)
      .values({
        workspaceId: tenant.id,
        email: `demo-${randomBytes(8).toString("hex")}@example.invalid`,
        displayName: "Demo Reader",
        passwordHash: null,
        status: "active",
        accountType: "demo",
        expiresAt,
        preferences: {},
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: appUser.id });

    await tx.insert(userRole).values({
      workspaceId: tenant.id,
      userId: user.id,
      roleId: reader.id,
      createdAt: now,
    });

    await tx.insert(userSession).values({
      sessionTokenHash: hashOpaqueSessionId(sessionId),
      userId: user.id,
      workspaceId: tenant.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId, expiresAt, userId: user.id };
  });
}

export async function cleanupExpiredDemoAccounts(input: { now?: Date } = {}): Promise<number> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [tenant] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.code, PUBLIC_WORKSPACE_CODE)).limit(1);
    if (!tenant) {
      throw new Error("PUBLIC_WORKSPACE_MISSING");
    }

    const expired = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.workspaceId, tenant.id), eq(appUser.accountType, "demo"), lte(appUser.expiresAt, now)));

    if (expired.length === 0) {
      return 0;
    }

    await tx.delete(appUser).where(and(eq(appUser.workspaceId, tenant.id), inArray(appUser.id, expired.map(({ id }) => id))));
    return expired.length;
  });
}
