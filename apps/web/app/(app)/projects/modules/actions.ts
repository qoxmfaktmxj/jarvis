"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectModule } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectModulesInput,
  listProjectModulesOutput,
  saveProjectModulesInput,
  saveProjectModulesOutput,
  type ProjectModuleRow,
} from "@jarvis/shared/validation/project";
import {
  resolveProjectContext,
  resolveProjectMutationContext,
} from "../_lib/project-extension-action-utils";

function serialize(row: typeof projectModule.$inferSelect): ProjectModuleRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    legacyEnterCd: row.legacyEnterCd ?? null,
    legacySabun: row.legacySabun ?? null,
    legacyPjtCd: row.legacyPjtCd ?? null,
    legacyModuleCd: row.legacyModuleCd ?? null,
    sabun: row.sabun ?? null,
    pjtCd: row.pjtCd ?? null,
    pjtNm: row.pjtNm ?? null,
    moduleCd: row.moduleCd ?? null,
    moduleNm: row.moduleNm ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listProjectModules(rawInput: unknown) {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) {
    return listProjectModulesOutput.parse({ ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error });
  }

  const input = listProjectModulesInput.parse(rawInput);
  const conditions = [eq(projectModule.workspaceId, ctx.workspaceId)];
  if (input.pjtCd) conditions.push(eq(projectModule.pjtCd, input.pjtCd));
  if (input.sabun) conditions.push(eq(projectModule.sabun, input.sabun));
  if (input.moduleCd) conditions.push(eq(projectModule.moduleCd, input.moduleCd));
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(projectModule.sabun, q),
      ilike(projectModule.pjtNm, q),
      ilike(projectModule.moduleNm, q)
    );
    if (filter) conditions.push(filter);
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(projectModule).where(where).orderBy(desc(projectModule.createdAt)).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(projectModule).where(where),
  ]);

  return listProjectModulesOutput.parse({
    ok: true,
    rows: rows.map(serialize),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveProjectModules(rawInput: unknown) {
  const input = saveProjectModulesInput.parse(rawInput);
  const ctx = await resolveProjectMutationContext(input);
  if (!ctx.ok) {
    return saveProjectModulesOutput.parse({ ok: false, created: 0, updated: 0, deleted: 0, error: ctx.error });
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;

  await db.transaction(async (tx) => {
    if (input.creates.length > 0) {
      const rows = await tx.insert(projectModule).values(
        input.creates.map((row) => ({
          ...row,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }))
      ).returning({ id: projectModule.id });
      created = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.module.create",
          resourceType: "project_module",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: {} as Record<string, unknown>,
          success: true,
        })));
      }
    }

    for (const update of input.updates) {
      const { id, ...patch } = update;
      const [row] = await tx.update(projectModule).set({
        ...patch,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      }).where(and(eq(projectModule.id, id), eq(projectModule.workspaceId, ctx.workspaceId))).returning({ id: projectModule.id });

      if (row) {
        updated++;
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.module.update",
          resourceType: "project_module",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: patch as Record<string, unknown>,
          success: true,
        });
      }
    }

    if (input.deletes.length > 0) {
      const rows = await tx.delete(projectModule)
        .where(and(eq(projectModule.workspaceId, ctx.workspaceId), inArray(projectModule.id, input.deletes)))
        .returning({ id: projectModule.id });
      deleted = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.module.delete",
          resourceType: "project_module",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: {} as Record<string, unknown>,
          success: true,
        })));
      }
    }
  });

  revalidatePath("/projects/modules");
  return saveProjectModulesOutput.parse({ ok: true, created, updated, deleted });
}
