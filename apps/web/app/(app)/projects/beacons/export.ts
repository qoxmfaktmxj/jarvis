"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectBeacon } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectBeaconsInput,
  type ProjectBeaconRow,
} from "@jarvis/shared/validation/project";
import type { z } from "zod";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import { resolveProjectContext } from "../_lib/project-extension-action-utils";
import { beaconVisibleColumns } from "./_components/columns";

const MAX_EXPORT_ROWS = 50_000;

type ExportInput = Omit<z.input<typeof listProjectBeaconsInput>, "page" | "limit">;

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

export async function exportProjectBeaconsToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listProjectBeaconsInput.parse({
    ...rawFilters,
    page: 1,
    limit: Math.min(MAX_EXPORT_ROWS, 200),
  });
  const conditions = [eq(projectBeacon.workspaceId, ctx.workspaceId)];
  if (input.pjtCd) conditions.push(eq(projectBeacon.pjtCd, input.pjtCd));
  if (input.sabun) conditions.push(eq(projectBeacon.sabun, input.sabun));
  if (input.outYn) conditions.push(eq(projectBeacon.outYn, input.outYn));
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(projectBeacon.beaconMcd, q),
      ilike(projectBeacon.beaconSer, q),
      ilike(projectBeacon.pjtNm, q),
    );
    if (filter) conditions.push(filter);
  }

  const rows = await db
    .select()
    .from(projectBeacon)
    .where(and(...conditions))
    .orderBy(desc(projectBeacon.createdAt))
    .limit(MAX_EXPORT_ROWS);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows = rows.map(serialize);
  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: beaconVisibleColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "비콘관리",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "project.beacon.export",
    resourceType: "project_beacon",
    resourceId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return {
    ok: true,
    filename: `project-beacons_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
