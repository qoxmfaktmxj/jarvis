"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, projectModule } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProjectModulesInput,
  type ProjectModuleRow,
} from "@jarvis/shared/validation/project";
import type { z } from "zod";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import { resolveProjectContext } from "../_lib/project-extension-action-utils";
import { moduleVisibleColumns } from "./_components/columns";

const MAX_EXPORT_ROWS = 50_000;

type ExportInput = Omit<z.input<typeof listProjectModulesInput>, "page" | "limit">;

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

export async function exportProjectModulesToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listProjectModulesInput.parse({
    ...rawFilters,
    page: 1,
    limit: Math.min(MAX_EXPORT_ROWS, 200),
  });
  const conditions = [eq(projectModule.workspaceId, ctx.workspaceId)];
  if (input.pjtCd) conditions.push(eq(projectModule.pjtCd, input.pjtCd));
  if (input.sabun) conditions.push(eq(projectModule.sabun, input.sabun));
  if (input.moduleCd) conditions.push(eq(projectModule.moduleCd, input.moduleCd));
  if (input.q) {
    const q = `%${input.q}%`;
    const filter = or(
      ilike(projectModule.sabun, q),
      ilike(projectModule.pjtNm, q),
      ilike(projectModule.moduleNm, q),
    );
    if (filter) conditions.push(filter);
  }

  const rows = await db
    .select()
    .from(projectModule)
    .where(and(...conditions))
    .orderBy(desc(projectModule.createdAt))
    .limit(MAX_EXPORT_ROWS);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows = rows.map(serialize);
  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: moduleVisibleColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "프로젝트모듈관리",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "project.module.export",
    resourceType: "project_module",
    resourceId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return {
    ok: true,
    filename: `project-modules_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
