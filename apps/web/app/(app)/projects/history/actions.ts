"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectHistory } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectHistoryInput,
  listProjectHistoryOutput,
  saveProjectHistoryInput,
  saveProjectHistoryOutput,
  type ProjectHistoryRow,
} from "@jarvis/shared/validation/project";
import {
  resolveProjectContext,
  resolveProjectMutationContext,
} from "../_lib/project-extension-action-utils";

function serialize(row: typeof projectHistory.$inferSelect): ProjectHistoryRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    legacyEnterCd: row.legacyEnterCd ?? null,
    legacySabun: row.legacySabun ?? null,
    legacyOrgCd: row.legacyOrgCd ?? null,
    legacyPjtCd: row.legacyPjtCd ?? null,
    sabun: row.sabun ?? null,
    orgCd: row.orgCd ?? null,
    pjtCd: row.pjtCd ?? null,
    pjtNm: row.pjtNm ?? null,
    custCd: row.custCd ?? null,
    custNm: row.custNm ?? null,
    sdate: row.sdate ?? null,
    edate: row.edate ?? null,
    regCd: row.regCd ?? null,
    regNm: row.regNm ?? null,
    deReg: row.deReg ?? null,
    flist: row.flist ?? null,
    plist: row.plist ?? null,
    roleCd: row.roleCd ?? null,
    roleNm: row.roleNm ?? null,
    module: row.module ?? null,
    bigo: row.bigo ?? null,
    memo: row.memo ?? null,
    etc1: row.etc1 ?? null,
    etc2: row.etc2 ?? null,
    etc3: row.etc3 ?? null,
    etc4: row.etc4 ?? null,
    etc5: row.etc5 ?? null,
    jobCd: row.jobCd ?? null,
    jobNm: row.jobNm ?? null,
    rewardYn: row.rewardYn ?? null,
    statusCd: row.statusCd ?? null,
    beaconMcd: row.beaconMcd ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listProjectHistory(rawInput: unknown) {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) {
    return listProjectHistoryOutput.parse({ ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error });
  }

  const input = listProjectHistoryInput.parse(rawInput);
  const conditions = [eq(projectHistory.workspaceId, ctx.workspaceId)];
  if (input.pjtCd) conditions.push(eq(projectHistory.pjtCd, input.pjtCd));
  if (input.sabun) conditions.push(eq(projectHistory.sabun, input.sabun));
  if (input.orgCd) conditions.push(eq(projectHistory.orgCd, input.orgCd));
  if (input.roleCd) conditions.push(eq(projectHistory.roleCd, input.roleCd));
  if (input.statusCd) conditions.push(eq(projectHistory.statusCd, input.statusCd));
  if (input.baseSymd) conditions.push(gte(projectHistory.edate, input.baseSymd));
  if (input.baseEymd) conditions.push(lte(projectHistory.sdate, input.baseEymd));
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(projectHistory.sabun, q),
      ilike(projectHistory.pjtCd, q),
      ilike(projectHistory.pjtNm, q),
      ilike(projectHistory.custNm, q),
      ilike(projectHistory.jobNm, q)
    );
    if (filter) conditions.push(filter);
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(projectHistory).where(where).orderBy(desc(projectHistory.sdate), desc(projectHistory.edate)).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(projectHistory).where(where),
  ]);

  return listProjectHistoryOutput.parse({
    ok: true,
    rows: rows.map(serialize),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveProjectHistory(rawInput: unknown) {
  const input = saveProjectHistoryInput.parse(rawInput);
  const ctx = await resolveProjectMutationContext(input);
  if (!ctx.ok) {
    return saveProjectHistoryOutput.parse({ ok: false, created: 0, updated: 0, deleted: 0, error: ctx.error });
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;

  await db.transaction(async (tx) => {
    if (input.creates.length > 0) {
      const rows = await tx.insert(projectHistory).values(
        input.creates.map((row) => ({
          ...row,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }))
      ).returning({ id: projectHistory.id });
      created = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.history.create",
          resourceType: "project_history",
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
      const [row] = await tx.update(projectHistory).set({
        ...patch,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      }).where(and(eq(projectHistory.id, id), eq(projectHistory.workspaceId, ctx.workspaceId))).returning({ id: projectHistory.id });

      if (row) {
        updated++;
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.history.update",
          resourceType: "project_history",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: patch as Record<string, unknown>,
          success: true,
        });
      }
    }

    if (input.deletes.length > 0) {
      const rows = await tx.delete(projectHistory)
        .where(and(eq(projectHistory.workspaceId, ctx.workspaceId), inArray(projectHistory.id, input.deletes)))
        .returning({ id: projectHistory.id });
      deleted = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.history.delete",
          resourceType: "project_history",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: {} as Record<string, unknown>,
          success: true,
        })));
      }
    }
  });

  revalidatePath("/projects/history");
  return saveProjectHistoryOutput.parse({ ok: true, created, updated, deleted });
}
