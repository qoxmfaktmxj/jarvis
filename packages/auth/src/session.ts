import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db";
import { appUser, permission, role, rolePermission, userRole, userSession } from "@jarvis/db/schema";
import { authSessionSchema } from "@jarvis/shared/validation/auth";
import type { Permission } from "@jarvis/shared/constants/permissions";
import { hasPermission } from "./rbac.js";
import type { AuthSession, SessionIssueResult } from "./types.js";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashOpaqueSessionId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function issueOpaqueSessionId(): string {
  return randomBytes(32).toString("hex");
}

type SessionRow = {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  accountType: "human" | "demo";
  userExpiresAt: Date | null;
  roleCode: AuthSession["roleCode"];
  permissionCode: string;
  sessionExpiresAt: Date;
};

async function selectSessionRows(sessionId: string): Promise<SessionRow[]> {
  return db
    .select({
      userId: appUser.id,
      workspaceId: appUser.workspaceId,
      email: appUser.email,
      displayName: appUser.displayName,
      status: appUser.status,
      accountType: appUser.accountType,
      userExpiresAt: appUser.expiresAt,
      roleCode: role.code,
      permissionCode: permission.code,
      sessionExpiresAt: userSession.expiresAt,
    })
    .from(userSession)
    .innerJoin(appUser, and(eq(appUser.id, userSession.userId), eq(appUser.workspaceId, userSession.workspaceId)))
    .innerJoin(userRole, and(eq(userRole.workspaceId, userSession.workspaceId), eq(userRole.userId, appUser.id)))
    .innerJoin(role, and(eq(role.workspaceId, userSession.workspaceId), eq(role.id, userRole.roleId)))
    .innerJoin(rolePermission, and(eq(rolePermission.workspaceId, userSession.workspaceId), eq(rolePermission.roleId, role.id)))
    .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
    .where(eq(userSession.sessionTokenHash, hashOpaqueSessionId(sessionId)));
}

export async function revokeSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }
  await db.delete(userSession).where(eq(userSession.sessionTokenHash, hashOpaqueSessionId(sessionId)));
}

export async function getSession(sessionId: string | null | undefined, now = new Date()): Promise<AuthSession | null> {
  if (!sessionId) {
    return null;
  }
  const rows = await selectSessionRows(sessionId);
  const head = rows[0];
  const invalid =
    !head ||
    head.status !== "active" ||
    head.sessionExpiresAt <= now ||
    (head.accountType === "demo" && (!head.userExpiresAt || head.userExpiresAt <= now));

  if (invalid) {
    await revokeSession(sessionId);
    return null;
  }

  return authSessionSchema.parse({
    id: sessionId,
    userId: head.userId,
    workspaceId: head.workspaceId,
    email: head.email,
    displayName: head.displayName,
    roleCode: head.roleCode,
    permissions: [...new Set(rows.map((row) => row.permissionCode as Permission))],
    accountType: head.accountType,
    expiresAt: head.sessionExpiresAt,
  });
}

async function insertSession(
  executor: Pick<typeof db, "insert">,
  input: { userId: string; workspaceId: string; ttlMs: number; now: Date },
): Promise<SessionIssueResult> {
  const sessionId = issueOpaqueSessionId();
  const expiresAt = new Date(input.now.getTime() + input.ttlMs);
  await executor.insert(userSession).values({
    sessionTokenHash: hashOpaqueSessionId(sessionId),
    userId: input.userId,
    workspaceId: input.workspaceId,
    expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { sessionId, expiresAt };
}

export async function createSession(input: { userId: string; ttlMs?: number; now?: Date }): Promise<SessionIssueResult> {
  const now = input.now ?? new Date();
  const [user] = await db
    .select({
      id: appUser.id,
      workspaceId: appUser.workspaceId,
      status: appUser.status,
      accountType: appUser.accountType,
      expiresAt: appUser.expiresAt,
    })
    .from(appUser)
    .where(eq(appUser.id, input.userId))
    .limit(1);

  if (!user || user.status !== "active" || (user.accountType === "demo" && (!user.expiresAt || user.expiresAt <= now))) {
    throw new Error("UNAUTHORIZED");
  }

  return insertSession(db, {
    userId: user.id,
    workspaceId: user.workspaceId,
    ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
    now,
  });
}

export async function rotateSession(input: {
  currentSessionId?: string | null;
  userId: string;
  ttlMs?: number;
  now?: Date;
}): Promise<SessionIssueResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    if (input.currentSessionId) {
      await tx.delete(userSession).where(eq(userSession.sessionTokenHash, hashOpaqueSessionId(input.currentSessionId)));
    }
    const [user] = await tx
      .select({
        id: appUser.id,
        workspaceId: appUser.workspaceId,
        status: appUser.status,
        accountType: appUser.accountType,
        expiresAt: appUser.expiresAt,
      })
      .from(appUser)
      .where(eq(appUser.id, input.userId))
      .limit(1);

    if (!user || user.status !== "active" || (user.accountType === "demo" && (!user.expiresAt || user.expiresAt <= now))) {
      throw new Error("UNAUTHORIZED");
    }

    return insertSession(tx, {
      userId: user.id,
      workspaceId: user.workspaceId,
      ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
      now,
    });
  });
}

export async function requireSession(input: { sessionId: string | null | undefined; now?: Date }): Promise<AuthSession> {
  const session = await getSession(input.sessionId, input.now);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requirePermission(input: {
  sessionId: string | null | undefined;
  permission: Permission;
  now?: Date;
}): Promise<AuthSession> {
  const session = await requireSession({ sessionId: input.sessionId, now: input.now });
  if (!hasPermission(session, input.permission)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
