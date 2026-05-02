"use server";

import { format } from "date-fns";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectHistory } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectHistoryInput,
  type ProjectHistoryRow,
} from "@jarvis/shared/validation/project";
import type { z } from "zod";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import { resolveProjectContext } from "../_lib/project-extension-action-utils";
import { historyVisibleColumns } from "./_components/columns";

const MAX_EXPORT_ROWS = 50_000;

type ExportInput = Omit<z.input<typeof listProjectHistoryInput>, "page" | "limit">;

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
    workHours: row.workHours ?? null,
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

export async function exportProjectHistoryToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listProjectHistoryInput.parse({
    ...rawFilters,
    page: 1,
    limit: Math.min(MAX_EXPORT_ROWS, 200),
  });
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
      ilike(projectHistory.jobNm, q),
    );
    if (filter) conditions.push(filter);
  }

  const rows = await db
    .select()
    .from(projectHistory)
    .where(and(...conditions))
    .orderBy(desc(projectHistory.sdate), desc(projectHistory.edate))
    .limit(MAX_EXPORT_ROWS);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows = rows.map(serialize);
  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: historyVisibleColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "프로젝트수행이력",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "project.history.export",
    resourceType: "project_history",
    resourceId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return {
    ok: true,
    filename: `project-history_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
