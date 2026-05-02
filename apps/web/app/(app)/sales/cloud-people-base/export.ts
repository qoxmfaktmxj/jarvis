"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesCloudPeopleBase } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listCloudPeopleBaseInput, type SalesCloudPeopleBaseRow } from "@jarvis/shared/validation/sales-people";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";
import { cloudPeopleBaseVisibleExportColumns } from "./_components/columns";

const MAX_EXPORT_ROWS = 50_000;

type ExportInput = Omit<z.input<typeof listCloudPeopleBaseInput>, "page" | "limit">;

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

export async function exportCloudPeopleBaseToExcel(rawFilters: ExportInput): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listCloudPeopleBaseInput.parse({ ...rawFilters, page: 1, limit: 200 });
  const conditions = [eq(salesCloudPeopleBase.workspaceId, ctx.workspaceId)];
  if (input.contYear) conditions.push(eq(salesCloudPeopleBase.contYear, input.contYear));
  if (input.pjtCode) conditions.push(eq(salesCloudPeopleBase.pjtCode, input.pjtCode));
  if (input.personType) conditions.push(eq(salesCloudPeopleBase.personType, input.personType));
  if (input.calcType) conditions.push(eq(salesCloudPeopleBase.calcType, input.calcType));
  if (input.q) {
    const q = `%${input.q}%`;
    conditions.push(or(ilike(salesCloudPeopleBase.contNo, q), ilike(salesCloudPeopleBase.pjtCode, q), ilike(salesCloudPeopleBase.companyCd, q))!);
  }

  const rows = await db
    .select()
    .from(salesCloudPeopleBase)
    .where(and(...conditions))
    .orderBy(desc(salesCloudPeopleBase.contYear), salesCloudPeopleBase.contNo)
    .limit(MAX_EXPORT_ROWS);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows: SalesCloudPeopleBaseRow[] = rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    contNo: r.contNo,
    contYear: r.contYear,
    seq: r.seq,
    contNm: null,
    pjtCode: r.pjtCode ?? null,
    pjtNm: null,
    companyCd: r.companyCd ?? null,
    companyNm: null,
    personType: r.personType,
    calcType: r.calcType,
    sdate: r.sdate,
    edate: r.edate ?? null,
    monthAmt: r.monthAmt ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: cloudPeopleBaseVisibleExportColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "인원단가기준관리",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.cloud_people_base.export",
    resourceType: "sales_cloud_people_base",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename: `cloud_people_base_${format(new Date(), "yyyy-MM-dd")}.xlsx`, bytes: new Uint8Array(buf) };
}
