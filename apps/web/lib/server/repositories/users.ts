import { and, asc, count, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { hashPassword } from "@jarvis/auth/password";
import { appUser, auditLog, db, role, userRole, userSession } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import {
  listUsersInput,
  listUsersOutput,
  saveUsersInput,
  saveUsersOutput,
} from "@jarvis/shared/validation/admin/user";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function appendAudit(tx: Tx, row: Parameters<typeof buildAuditRow>[0]) {
  await tx.insert(auditLog).values(buildAuditRow(row));
}

export async function listUsers(context: { workspaceId: string }, raw: unknown) {
  const input = listUsersInput.parse(raw);
  const where = and(
    eq(appUser.workspaceId, context.workspaceId),
    input.q
      ? or(
          ilike(appUser.email, `%${escapeLike(input.q)}%`),
          ilike(appUser.displayName, `%${escapeLike(input.q)}%`),
        )
      : undefined,
    eq(appUser.accountType, input.accountType),
    input.status ? eq(appUser.status, input.status) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: appUser.id,
        email: appUser.email,
        displayName: appUser.displayName,
        role: role.code,
        accountType: appUser.accountType,
        status: appUser.status,
        createdAt: appUser.createdAt,
        updatedAt: appUser.updatedAt,
      })
      .from(appUser)
      .innerJoin(
        userRole,
        and(eq(userRole.workspaceId, context.workspaceId), eq(userRole.userId, appUser.id)),
      )
      .innerJoin(role, and(eq(role.id, userRole.roleId), eq(role.workspaceId, context.workspaceId)))
      .where(where)
      .orderBy(asc(appUser.displayName))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(appUser).where(where),
  ]);
  return listUsersOutput.parse({
    rows: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: Number(totals[0]?.total ?? 0),
  });
}

export async function saveUsers(
  context: { workspaceId: string; actorUserId: string },
  raw: unknown,
) {
  const input = saveUsersInput.parse(raw);
  const preparedCreates = await Promise.all(
    input.creates.map(async ({ initialPassword, ...user }) => ({
      ...user,
      passwordHash: await hashPassword(initialPassword),
    })),
  );
  const counts = { created: 0, updated: 0, deleted: 0 };

  await db.transaction(async (tx) => {
    const roles = await tx
      .select({ id: role.id, code: role.code })
      .from(role)
      .where(eq(role.workspaceId, context.workspaceId));
    const roleIds = new Map(roles.map((row) => [row.code, row.id]));

    for (const create of preparedCreates) {
      const roleId = roleIds.get(create.role);
      if (!roleId) throw new Error("role is not defined in workspace");
      await tx.insert(appUser).values({
        id: create.id,
        workspaceId: context.workspaceId,
        email: create.email,
        displayName: create.displayName,
        passwordHash: create.passwordHash,
        accountType: "human",
        status: create.status,
        expiresAt: null,
      });
      await tx.insert(userRole).values({
        workspaceId: context.workspaceId,
        userId: create.id,
        roleId,
      });
      await appendAudit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.user.create",
        resourceType: "app_user",
        resourceId: create.id,
        details: { email: create.email, role: create.role, status: create.status },
      });
      counts.created += 1;
    }

    for (const update of input.updates) {
      const [current] = await tx
        .select({
          email: appUser.email,
          displayName: appUser.displayName,
          status: appUser.status,
          role: role.code,
        })
        .from(appUser)
        .innerJoin(
          userRole,
          and(
            eq(userRole.workspaceId, context.workspaceId),
            eq(userRole.userId, appUser.id),
          ),
        )
        .innerJoin(
          role,
          and(
            eq(role.workspaceId, context.workspaceId),
            eq(role.id, userRole.roleId),
          ),
        )
        .where(
          and(
            eq(appUser.id, update.id),
            eq(appUser.workspaceId, context.workspaceId),
            eq(appUser.accountType, "human"),
          ),
        )
        .limit(1);
      if (!current) continue;

      const patch: Partial<typeof appUser.$inferInsert> = {};
      const changedFields: string[] = [];
      if (update.patch.email !== undefined && update.patch.email !== current.email) {
        patch.email = update.patch.email;
        changedFields.push("email");
      }
      if (
        update.patch.displayName !== undefined &&
        update.patch.displayName !== current.displayName
      ) {
        patch.displayName = update.patch.displayName;
        changedFields.push("displayName");
      }
      const statusChanged =
        update.patch.status !== undefined && update.patch.status !== current.status;
      if (statusChanged) {
        patch.status = update.patch.status;
        changedFields.push("status");
      }
      const nextRole = update.patch.role;
      const roleChanged = nextRole !== undefined && nextRole !== current.role;
      if (roleChanged) {
        const roleId = roleIds.get(nextRole);
        if (!roleId) throw new Error("role is not defined in workspace");
        await tx
          .update(userRole)
          .set({ roleId })
          .where(
            and(
              eq(userRole.workspaceId, context.workspaceId),
              eq(userRole.userId, update.id),
            ),
          );
        changedFields.push("role");
      }

      if (Object.keys(patch).length > 0) {
        await tx
          .update(appUser)
          .set({ ...patch, updatedAt: new Date() })
          .where(
            and(
              eq(appUser.id, update.id),
              eq(appUser.workspaceId, context.workspaceId),
              eq(appUser.accountType, "human"),
            ),
          );
      }
      if (changedFields.length > 0) {
        if (statusChanged || roleChanged) {
          await tx
            .delete(userSession)
            .where(
              and(
                eq(userSession.workspaceId, context.workspaceId),
                eq(userSession.userId, update.id),
              ),
            );
        }
        await appendAudit(tx, {
          workspaceId: context.workspaceId,
          userId: context.actorUserId,
          action: "admin.user.update",
          resourceType: "app_user",
          resourceId: update.id,
          details: { fields: changedFields },
        });
        counts.updated += 1;
      }
    }

    if (input.deletes.length > 0) {
      const removed = await tx
        .delete(appUser)
        .where(
          and(
            eq(appUser.workspaceId, context.workspaceId),
            eq(appUser.accountType, "human"),
            ne(appUser.id, context.actorUserId),
            inArray(appUser.id, input.deletes),
          ),
        )
        .returning({ id: appUser.id });
      for (const row of removed) {
        await appendAudit(tx, {
          workspaceId: context.workspaceId,
          userId: context.actorUserId,
          action: "admin.user.delete",
          resourceType: "app_user",
          resourceId: row.id,
        });
      }
      counts.deleted = removed.length;
    }
  });
  return saveUsersOutput.parse({ ok: true, ...counts });
}
