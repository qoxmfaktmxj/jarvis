"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesCloudPeopleCalc } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listCloudPeopleCalcInput, type SalesCloudPeopleCalcRow } from "@jarvis/shared/validation/sales-people";
import {
  EXPORT_ROW_LIMIT,
  enforceExportLimit,
  exportToExcel,
} from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";
import { cloudPeopleCalcVisibleExportColumns } from "./_components/columns";

type ExportInput = Omit<z.input<typeof listCloudPeopleCalcInput>, "page" | "limit">;

async function resolveSalesContext() {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const sessionId = headerStore.get("x-session-id") ?? cookieStore.get("sessionId")?.value ?? cookieStore.get("jarvis_session")?.value ?? null;
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) return { ok: false as const, error: "Forbidden" };
  return { ok: true as const, userId: session.userId, workspaceId: session.workspaceId };
}

export async function exportCloudPeopleCalcToExcel(rawFilters: ExportInput): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listCloudPeopleCalcInput.parse({ ...rawFilters, page: 1, limit: 200 });
  const conditions = [eq(salesCloudPeopleCalc.workspaceId, ctx.workspaceId)];
  if (input.contYear) conditions.push(eq(salesCloudPeopleCalc.contYear, input.contYear));
  if (input.ym) conditions.push(eq(salesCloudPeopleCalc.ym, input.ym));
  if (input.personType) conditions.push(eq(salesCloudPeopleCalc.personType, input.personType));
  if (input.calcType) conditions.push(eq(salesCloudPeopleCalc.calcType, input.calcType));
  if (input.q) {
    const q = `%${input.q}%`;
    conditions.push(or(ilike(salesCloudPeopleCalc.contNo, q), ilike(salesCloudPeopleCalc.note, q))!);
  }

  const rows = await db
    .select()
    .from(salesCloudPeopleCalc)
    .where(and(...conditions))
    .orderBy(desc(salesCloudPeopleCalc.ym), salesCloudPeopleCalc.contNo)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rows);
  if (!guard.ok) return { ok: false, error: guard.error };

  const exportRows: SalesCloudPeopleCalcRow[] = guard.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    contNm: null,
    pjtCode: null,
    pjtNm: null,
    companyCd: null,
    companyNm: null,
    ym: r.ym,
    reflYn: r.reflYn ?? null,
    personType: r.personType,
    calcType: r.calcType,
    monthAmt: null,
    personCnt: r.personCnt ?? null,
    totalAmt: r.totalAmt ?? null,
    note: r.note ?? null,
    reflId: r.reflId ?? null,
    reflDate: r.reflDate ? r.reflDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: cloudPeopleCalcVisibleExportColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "인원단가현황",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.cloud_people_calc.export",
    resourceType: "sales_cloud_people_calc",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename: `cloud_people_calc_${format(new Date(), "yyyy-MM-dd")}.xlsx`, bytes: new Uint8Array(buf) };
}
