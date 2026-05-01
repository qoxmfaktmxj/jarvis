"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectBeacon } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectBeaconsInput,
  listProjectBeaconsOutput,
  saveProjectBeaconsInput,
  saveProjectBeaconsOutput,
  type ProjectBeaconRow,
} from "@jarvis/shared/validation/project";
import {
  resolveProjectContext,
  resolveProjectMutationContext,
} from "../_lib/project-extension-action-utils";

function serialize(row: typeof projectBeacon.$inferSelect): ProjectBeaconRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    legacyEnterCd: row.legacyEnterCd ?? null,
    legacyBeaconMcd: row.legacyBeaconMcd ?? null,
    legacyBeaconSer: row.legacyBeaconSer ?? null,
    beaconMcd: row.beaconMcd ?? null,
    beaconSer: row.beaconSer ?? null,
    pjtCd: row.pjtCd ?? null,
    pjtNm: row.pjtNm ?? null,
    sdate: row.sdate ?? null,
    edate: row.edate ?? null,
    sabun: row.sabun ?? null,
    outYn: row.outYn ?? null,
    bigo: row.bigo ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listProjectBeacons(rawInput: unknown) {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) {
    return listProjectBeaconsOutput.parse({ ok: false, rows: [], total: 0, page: 1, limit: 50, error: ctx.error });
  }

  const input = listProjectBeaconsInput.parse(rawInput);
  const conditions = [eq(projectBeacon.workspaceId, ctx.workspaceId)];
  if (input.pjtCd) conditions.push(eq(projectBeacon.pjtCd, input.pjtCd));
  if (input.sabun) conditions.push(eq(projectBeacon.sabun, input.sabun));
  if (input.outYn) conditions.push(eq(projectBeacon.outYn, input.outYn));
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(projectBeacon.beaconMcd, q),
      ilike(projectBeacon.beaconSer, q),
      ilike(projectBeacon.pjtNm, q)
    );
    if (filter) conditions.push(filter);
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(projectBeacon).where(where).orderBy(desc(projectBeacon.createdAt)).limit(input.limit).offset(offset),
    db.select({ count: count() }).from(projectBeacon).where(where),
  ]);

  return listProjectBeaconsOutput.parse({
    ok: true,
    rows: rows.map(serialize),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  });
}

export async function saveProjectBeacons(rawInput: unknown) {
  const input = saveProjectBeaconsInput.parse(rawInput);
  const ctx = await resolveProjectMutationContext(input);
  if (!ctx.ok) {
    return saveProjectBeaconsOutput.parse({ ok: false, created: 0, updated: 0, deleted: 0, error: ctx.error });
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;

  await db.transaction(async (tx) => {
    if (input.creates.length > 0) {
      const rows = await tx.insert(projectBeacon).values(
        input.creates.map((row) => ({
          ...row,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }))
      ).returning({ id: projectBeacon.id });
      created = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.beacon.create",
          resourceType: "project_beacon",
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
      const [row] = await tx.update(projectBeacon).set({
        ...patch,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      }).where(and(eq(projectBeacon.id, id), eq(projectBeacon.workspaceId, ctx.workspaceId))).returning({ id: projectBeacon.id });

      if (row) {
        updated++;
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.beacon.update",
          resourceType: "project_beacon",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: patch as Record<string, unknown>,
          success: true,
        });
      }
    }

    if (input.deletes.length > 0) {
      const rows = await tx.delete(projectBeacon)
        .where(and(eq(projectBeacon.workspaceId, ctx.workspaceId), inArray(projectBeacon.id, input.deletes)))
        .returning({ id: projectBeacon.id });
      deleted = rows.length;

      if (rows.length > 0) {
        await tx.insert(auditLog).values(rows.map((row) => ({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "project.beacon.delete",
          resourceType: "project_beacon",
          resourceId: row.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          details: {} as Record<string, unknown>,
          success: true,
        })));
      }
    }
  });

  revalidatePath("/projects/beacons");
  return saveProjectBeaconsOutput.parse({ ok: true, created, updated, deleted });
}
