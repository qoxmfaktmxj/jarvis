import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import { auditLog, db, menuItem, menuPermission, permission } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import { normalizeAllowedRoutePath } from "@jarvis/shared/constants/routes";
import {
  listMenusInput,
  listMenusOutput,
  saveMenusInput,
  saveMenusOutput,
} from "@jarvis/shared/validation/admin/menu";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function audit(tx: Tx, row: Parameters<typeof buildAuditRow>[0]) {
  await tx.insert(auditLog).values(buildAuditRow(row));
}

async function requireAcyclicParent(
  tx: Tx,
  workspaceId: string,
  menuItemId: string,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  const seen = new Set<string>([menuItemId]);
  let cursor: string | null = parentId;
  while (cursor) {
    if (seen.has(cursor)) throw new Error("menu parent cycle is not allowed");
    seen.add(cursor);
    const [parent]: Array<{ id: string; parentId: string | null }> = await tx
      .select({ id: menuItem.id, parentId: menuItem.parentId })
      .from(menuItem)
      .where(and(eq(menuItem.workspaceId, workspaceId), eq(menuItem.id, cursor)))
      .limit(1);
    if (!parent) throw new Error("parent menu is outside workspace");
    cursor = parent.parentId;
  }
}

async function replacePermissions(
  tx: Tx,
  workspaceId: string,
  menuItemId: string,
  codes: string[],
) {
  const rows =
    codes.length === 0
      ? []
      : await tx
          .select({ id: permission.id, code: permission.code })
          .from(permission)
          .where(inArray(permission.code, codes));
  if (rows.length !== new Set(codes).size) throw new Error("unknown fixed permission code");
  await tx
    .delete(menuPermission)
    .where(
      and(
        eq(menuPermission.workspaceId, workspaceId),
        eq(menuPermission.menuItemId, menuItemId),
      ),
    );
  if (rows.length > 0) {
    await tx.insert(menuPermission).values(
      rows.map((row) => ({ workspaceId, menuItemId, permissionId: row.id })),
    );
  }
}

export async function listMenus(context: { workspaceId: string }, raw: unknown) {
  const input = listMenusInput.parse(raw);
  const where = and(
    eq(menuItem.workspaceId, context.workspaceId),
    input.kind ? eq(menuItem.kind, input.kind) : undefined,
    input.q
      ? or(
          ilike(menuItem.code, `%${escapeLike(input.q)}%`),
          ilike(menuItem.label, `%${escapeLike(input.q)}%`),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(menuItem)
      .where(where)
      .orderBy(asc(menuItem.sortOrder), asc(menuItem.code))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(menuItem).where(where),
  ]);
  const ids = rows.map(({ id }) => id);
  const grants =
    ids.length === 0
      ? []
      : await db
          .select({ menuItemId: menuPermission.menuItemId, code: permission.code })
          .from(menuPermission)
          .innerJoin(permission, eq(permission.id, menuPermission.permissionId))
          .where(
            and(
              eq(menuPermission.workspaceId, context.workspaceId),
              inArray(menuPermission.menuItemId, ids),
            ),
          );
  return listMenusOutput.parse({
    rows: rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      code: row.code,
      label: row.label,
      description: row.description,
      kind: row.kind,
      icon: row.icon,
      routePath: row.routePath,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
      permissionCodes: grants
        .filter((grant) => grant.menuItemId === row.id)
        .map((grant) => grant.code)
        .sort(),
    })),
    total: Number(totals[0]?.total ?? 0),
  });
}

export async function saveMenus(
  context: { workspaceId: string; actorUserId: string },
  raw: unknown,
) {
  const input = saveMenusInput.parse(raw);
  const counts = { created: 0, updated: 0, deleted: 0 };
  await db.transaction(async (tx) => {
    for (const create of input.creates) {
      await requireAcyclicParent(tx, context.workspaceId, create.id, create.parentId);
      await tx.insert(menuItem).values({
        id: create.id,
        workspaceId: context.workspaceId,
        parentId: create.parentId,
        code: create.code,
        label: create.label,
        description: create.description,
        kind: create.kind,
        icon: create.icon,
        routePath: normalizeAllowedRoutePath(create.routePath),
        sortOrder: create.sortOrder,
        isVisible: create.isVisible,
      });
      await replacePermissions(tx, context.workspaceId, create.id, create.permissionCodes);
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.menu.create",
        resourceType: "menu_item",
        resourceId: create.id,
        details: {
          code: create.code,
          routePath: create.routePath,
          permissionCodes: create.permissionCodes,
        },
      });
      counts.created += 1;
    }

    for (const update of input.updates) {
      const owned = await tx
        .select({ id: menuItem.id, kind: menuItem.kind, routePath: menuItem.routePath })
        .from(menuItem)
        .where(
          and(eq(menuItem.workspaceId, context.workspaceId), eq(menuItem.id, update.id)),
        )
        .limit(1);
      if (!owned[0]) continue;
      if (update.patch.parentId !== undefined) {
        await requireAcyclicParent(tx, context.workspaceId, update.id, update.patch.parentId);
      }
      const nextKind = update.patch.kind ?? owned[0].kind;
      const nextRoutePath =
        update.patch.routePath === undefined
          ? owned[0].routePath
          : normalizeAllowedRoutePath(update.patch.routePath);
      if (nextKind === "group" && nextRoutePath !== null) throw new Error("group route must be null");
      if (nextKind === "page" && nextRoutePath === null) throw new Error("page route is required");

      const patch: Partial<typeof menuItem.$inferInsert> = {};
      if (update.patch.parentId !== undefined) patch.parentId = update.patch.parentId;
      if (update.patch.code !== undefined) patch.code = update.patch.code;
      if (update.patch.label !== undefined) patch.label = update.patch.label;
      if (update.patch.description !== undefined) patch.description = update.patch.description;
      if (update.patch.kind !== undefined) patch.kind = update.patch.kind;
      if (update.patch.icon !== undefined) patch.icon = update.patch.icon;
      if (update.patch.routePath !== undefined) patch.routePath = nextRoutePath;
      if (update.patch.sortOrder !== undefined) patch.sortOrder = update.patch.sortOrder;
      if (update.patch.isVisible !== undefined) patch.isVisible = update.patch.isVisible;
      if (Object.keys(patch).length > 0) {
        await tx
          .update(menuItem)
          .set({ ...patch, updatedAt: new Date() })
          .where(
            and(eq(menuItem.workspaceId, context.workspaceId), eq(menuItem.id, update.id)),
          );
      }
      if (update.patch.permissionCodes !== undefined) {
        await replacePermissions(tx, context.workspaceId, update.id, update.patch.permissionCodes);
      }
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.menu.update",
        resourceType: "menu_item",
        resourceId: update.id,
        details: { fields: Object.keys(update.patch) },
      });
      counts.updated += 1;
    }

    if (input.deletes.length > 0) {
      const removed = await tx
        .delete(menuItem)
        .where(
          and(
            eq(menuItem.workspaceId, context.workspaceId),
            inArray(menuItem.id, input.deletes),
          ),
        )
        .returning({ id: menuItem.id });
      for (const row of removed) {
        await audit(tx, {
          workspaceId: context.workspaceId,
          userId: context.actorUserId,
          action: "admin.menu.delete",
          resourceType: "menu_item",
          resourceId: row.id,
        });
      }
      counts.deleted = removed.length;
    }
  });
  return saveMenusOutput.parse({ ok: true, ...counts });
}
