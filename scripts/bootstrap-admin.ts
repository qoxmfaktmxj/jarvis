import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { db, PUBLIC_WORKSPACE_CODE } from "@jarvis/db";
import { appUser, role, userRole, workspace } from "@jarvis/db/schema";
import { hashPassword } from "@jarvis/auth";
import { bootstrapAdminEnvSchema } from "@jarvis/shared/validation/auth";
import { validateBootstrapPassword } from "./bootstrap-password.js";

export async function bootstrapAdmin(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ created: boolean; userId: string | null }> {
  const parsed = bootstrapAdminEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
  }
  validateBootstrapPassword(parsed.data.BOOTSTRAP_ADMIN_PASSWORD);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [tenant] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.code, PUBLIC_WORKSPACE_CODE)).limit(1);
    if (!tenant) {
      throw new Error("PUBLIC_WORKSPACE_MISSING");
    }
    const [adminRole] = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.workspaceId, tenant.id), eq(role.code, "ADMIN")))
      .limit(1);
    if (!adminRole) {
      throw new Error("ADMIN_ROLE_MISSING");
    }
    const [existing] = await tx
      .select({ userId: appUser.id })
      .from(appUser)
      .innerJoin(userRole, and(eq(userRole.workspaceId, tenant.id), eq(userRole.userId, appUser.id)))
      .where(and(eq(appUser.workspaceId, tenant.id), eq(appUser.accountType, "human"), eq(userRole.roleId, adminRole.id)))
      .limit(1);
    if (existing) {
      return { created: false, userId: existing.userId };
    }
    const [user] = await tx
      .insert(appUser)
      .values({
        workspaceId: tenant.id,
        email: parsed.data.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(),
        displayName: "Bootstrap Admin",
        passwordHash: await hashPassword(parsed.data.BOOTSTRAP_ADMIN_PASSWORD),
        status: "active",
        accountType: "human",
        expiresAt: null,
        preferences: {},
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: appUser.id });
    await tx.insert(userRole).values({
      workspaceId: tenant.id,
      userId: user.id,
      roleId: adminRole.id,
      createdAt: now,
    });
    return { created: true, userId: user.id };
  });
}

export async function runBootstrapAdmin(
  env: NodeJS.ProcessEnv = process.env,
  writeOut: (line: string) => void = (line) => process.stdout.write(line),
  writeErr: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> {
  try {
    const result = await bootstrapAdmin(env);
    writeOut(result.created ? "bootstrap-admin: created\n" : "bootstrap-admin: already-exists\n");
  } catch (error) {
    writeErr(`${error instanceof Error ? error.message : "bootstrap-admin failed"}\n`);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBootstrapAdmin().catch(() => {
    process.exitCode = 1;
  });
}
