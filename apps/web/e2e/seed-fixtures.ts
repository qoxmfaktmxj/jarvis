import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "@jarvis/auth/password";
import {
  appUser,
  db,
  pool,
  PUBLIC_WORKSPACE_CODE,
  role,
  userRole,
  userSession,
  wikiReviewQueue,
  workspace,
} from "@jarvis/db";
import type { RoleCode } from "@jarvis/shared";

function requireSyntheticCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Playwright`);
  return value;
}

async function upsertHumanUser(input: {
  workspaceId: string;
  email: string;
  password: string;
  roleCode: RoleCode;
}): Promise<string> {
  if (!input.email.endsWith("@example.invalid")) {
    throw new Error("Playwright users must use example.invalid");
  }
  const [roleRow] = await db.select({ id: role.id }).from(role).where(and(
    eq(role.workspaceId, input.workspaceId),
    eq(role.code, input.roleCode),
  )).limit(1);
  if (!roleRow) throw new Error(`missing ${input.roleCode} role`);

  const passwordHash = await hashPassword(input.password);
  const [existing] = await db.select({ id: appUser.id }).from(appUser).where(and(
    eq(appUser.workspaceId, input.workspaceId),
    eq(appUser.email, input.email),
  )).limit(1);
  const userId = existing?.id ?? randomUUID();
  if (existing) {
    await db.update(appUser).set({
      passwordHash,
      displayName: `E2E ${input.roleCode}`,
      accountType: "human",
      status: "active",
      expiresAt: null,
      updatedAt: new Date(),
    }).where(and(eq(appUser.workspaceId, input.workspaceId), eq(appUser.id, userId)));
  } else {
    await db.insert(appUser).values({
      id: userId,
      workspaceId: input.workspaceId,
      email: input.email,
      displayName: `E2E ${input.roleCode}`,
      passwordHash,
      accountType: "human",
      status: "active",
      expiresAt: null,
      preferences: {},
    });
  }
  await db.delete(userRole).where(and(
    eq(userRole.workspaceId, input.workspaceId),
    eq(userRole.userId, userId),
  ));
  await db.insert(userRole).values({ workspaceId: input.workspaceId, userId, roleId: roleRow.id });
  await db.delete(userSession).where(and(
    eq(userSession.workspaceId, input.workspaceId),
    eq(userSession.userId, userId),
  ));
  return userId;
}

async function seedE2eFixtures(): Promise<void> {
  try {
    const [tenant] = await db.select({ id: workspace.id }).from(workspace)
      .where(eq(workspace.code, PUBLIC_WORKSPACE_CODE)).limit(1);
    if (!tenant) throw new Error("public workspace is missing; run pnpm setup:local first");

    await upsertHumanUser({
      workspaceId: tenant.id,
      email: requireSyntheticCredential("PLAYWRIGHT_ADMIN_EMAIL").toLowerCase(),
      password: requireSyntheticCredential("PLAYWRIGHT_ADMIN_PASSWORD"),
      roleCode: "ADMIN",
    });
    await upsertHumanUser({
      workspaceId: tenant.id,
      email: requireSyntheticCredential("PLAYWRIGHT_EDITOR_EMAIL").toLowerCase(),
      password: requireSyntheticCredential("PLAYWRIGHT_EDITOR_PASSWORD"),
      roleCode: "EDITOR",
    });
    await upsertHumanUser({
      workspaceId: tenant.id,
      email: requireSyntheticCredential("PLAYWRIGHT_TARGET_EMAIL").toLowerCase(),
      password: requireSyntheticCredential("PLAYWRIGHT_TARGET_PASSWORD"),
      roleCode: "READER",
    });

    await db.delete(wikiReviewQueue).where(and(
      eq(wikiReviewQueue.workspaceId, tenant.id),
      eq(wikiReviewQueue.description, "E2E synthetic review"),
    ));
    await db.insert(wikiReviewQueue).values({
      workspaceId: tenant.id,
      kind: "citation_validation",
      description: "E2E synthetic review",
      affectedPages: [],
      payload: { synthetic: true },
      status: "pending",
    });
  } finally {
    await pool.end();
  }
}

void seedE2eFixtures().catch((error) => {
  console.error(error instanceof Error ? error.message : "Playwright fixture seed failed");
  process.exitCode = 1;
});
