import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import { auditLog, codeGroup, codeItem, db } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import {
  listCodeGroupsInput,
  listCodeGroupsOutput,
  listCodeItemsInput,
  listCodeItemsOutput,
  saveCodeGroupsInput,
  saveCodeGroupsOutput,
  saveCodeItemsInput,
  saveCodeItemsOutput,
} from "@jarvis/shared/validation/admin/code";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function audit(tx: Tx, row: Parameters<typeof buildAuditRow>[0]) {
  await tx.insert(auditLog).values(buildAuditRow(row));
}

export async function listCodeGroups(context: { workspaceId: string }, raw: unknown) {
  const input = listCodeGroupsInput.parse(raw);
  const where = and(
    eq(codeGroup.workspaceId, context.workspaceId),
    input.q
      ? or(
          ilike(codeGroup.code, `%${escapeLike(input.q)}%`),
          ilike(codeGroup.name, `%${escapeLike(input.q)}%`),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: codeGroup.id,
        code: codeGroup.code,
        name: codeGroup.name,
        description: codeGroup.description,
        isActive: codeGroup.isActive,
        itemCount: count(codeItem.id),
      })
      .from(codeGroup)
      .leftJoin(
        codeItem,
        and(
          eq(codeItem.workspaceId, context.workspaceId),
          eq(codeItem.groupId, codeGroup.id),
        ),
      )
      .where(where)
      .groupBy(codeGroup.id)
      .orderBy(asc(codeGroup.code))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(codeGroup).where(where),
  ]);
  return listCodeGroupsOutput.parse({
    rows: rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) })),
    total: Number(totals[0]?.total ?? 0),
  });
}

export async function saveCodeGroups(
  context: { workspaceId: string; actorUserId: string },
  raw: unknown,
) {
  const input = saveCodeGroupsInput.parse(raw);
  const counts = { created: 0, updated: 0, deleted: 0 };
  await db.transaction(async (tx) => {
    for (const create of input.creates) {
      await tx.insert(codeGroup).values({ ...create, workspaceId: context.workspaceId });
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.code-group.create",
        resourceType: "code_group",
        resourceId: create.id,
        details: { code: create.code, name: create.name },
      });
      counts.created += 1;
    }
    for (const update of input.updates) {
      if (Object.keys(update.patch).length === 0) continue;
      const rows = await tx
        .update(codeGroup)
        .set({ ...update.patch, updatedAt: new Date() })
        .where(
          and(eq(codeGroup.workspaceId, context.workspaceId), eq(codeGroup.id, update.id)),
        )
        .returning({ id: codeGroup.id });
      if (!rows[0]) continue;
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.code-group.update",
        resourceType: "code_group",
        resourceId: update.id,
        details: { fields: Object.keys(update.patch) },
      });
      counts.updated += 1;
    }
    if (input.deletes.length > 0) {
      const rows = await tx
        .delete(codeGroup)
        .where(
          and(
            eq(codeGroup.workspaceId, context.workspaceId),
            inArray(codeGroup.id, input.deletes),
          ),
        )
        .returning({ id: codeGroup.id });
      for (const row of rows) {
        await audit(tx, {
          workspaceId: context.workspaceId,
          userId: context.actorUserId,
          action: "admin.code-group.delete",
          resourceType: "code_group",
          resourceId: row.id,
        });
      }
      counts.deleted = rows.length;
    }
  });
  return saveCodeGroupsOutput.parse({ ok: true, ...counts });
}

export async function listCodeItems(context: { workspaceId: string }, raw: unknown) {
  const input = listCodeItemsInput.parse(raw);
  const group = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(
      and(
        eq(codeGroup.workspaceId, context.workspaceId),
        eq(codeGroup.id, input.groupId),
      ),
    )
    .limit(1);
  if (!group[0]) return listCodeItemsOutput.parse({ rows: [], total: 0 });

  const where = and(
    eq(codeItem.workspaceId, context.workspaceId),
    eq(codeItem.groupId, input.groupId),
    input.q
      ? or(
          ilike(codeItem.code, `%${escapeLike(input.q)}%`),
          ilike(codeItem.name, `%${escapeLike(input.q)}%`),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: codeItem.id,
        groupId: codeItem.groupId,
        code: codeItem.code,
        name: codeItem.name,
        description: codeItem.description,
        sortOrder: codeItem.sortOrder,
        isActive: codeItem.isActive,
        metadata: codeItem.metadata,
      })
      .from(codeItem)
      .where(where)
      .orderBy(asc(codeItem.sortOrder), asc(codeItem.code))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(codeItem).where(where),
  ]);
  return listCodeItemsOutput.parse({ rows, total: Number(totals[0]?.total ?? 0) });
}

export async function saveCodeItems(
  context: { workspaceId: string; actorUserId: string },
  raw: unknown,
) {
  const input = saveCodeItemsInput.parse(raw);
  const counts = { created: 0, updated: 0, deleted: 0 };
  await db.transaction(async (tx) => {
    const assertGroup = async (groupId: string) => {
      const rows = await tx
        .select({ id: codeGroup.id })
        .from(codeGroup)
        .where(
          and(eq(codeGroup.workspaceId, context.workspaceId), eq(codeGroup.id, groupId)),
        )
        .limit(1);
      if (!rows[0]) throw new Error("code group is outside workspace");
    };

    for (const create of input.creates) {
      await assertGroup(create.groupId);
      await tx.insert(codeItem).values({ ...create, workspaceId: context.workspaceId });
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.code-item.create",
        resourceType: "code_item",
        resourceId: create.id,
        details: { groupId: create.groupId, code: create.code },
      });
      counts.created += 1;
    }
    for (const update of input.updates) {
      if (update.patch.groupId) await assertGroup(update.patch.groupId);
      if (Object.keys(update.patch).length === 0) continue;
      const rows = await tx
        .update(codeItem)
        .set({ ...update.patch, updatedAt: new Date() })
        .where(
          and(eq(codeItem.workspaceId, context.workspaceId), eq(codeItem.id, update.id)),
        )
        .returning({ id: codeItem.id });
      if (!rows[0]) continue;
      await audit(tx, {
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.code-item.update",
        resourceType: "code_item",
        resourceId: update.id,
        details: { fields: Object.keys(update.patch) },
      });
      counts.updated += 1;
    }
    if (input.deletes.length > 0) {
      const rows = await tx
        .delete(codeItem)
        .where(
          and(
            eq(codeItem.workspaceId, context.workspaceId),
            inArray(codeItem.id, input.deletes),
          ),
        )
        .returning({ id: codeItem.id });
      for (const row of rows) {
        await audit(tx, {
          workspaceId: context.workspaceId,
          userId: context.actorUserId,
          action: "admin.code-item.delete",
          resourceType: "code_item",
          resourceId: row.id,
        });
      }
      counts.deleted = rows.length;
    }
  });
  return saveCodeItemsOutput.parse({ ok: true, ...counts });
}
