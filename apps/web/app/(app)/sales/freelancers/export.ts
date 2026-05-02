"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, salesFreelancer } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listFreelancersInput, type SalesFreelancerRow } from "@jarvis/shared/validation/sales-people";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";
import { freelancerVisibleExportColumns } from "./_components/columns";

const MAX_EXPORT_ROWS = 50_000;

type ExportInput = Omit<z.input<typeof listFreelancersInput>, "page" | "limit">;

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

export async function exportFreelancersToExcel(rawFilters: ExportInput): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listFreelancersInput.parse({ ...rawFilters, page: 1, limit: 200 });
  const conditions = [eq(salesFreelancer.workspaceId, ctx.workspaceId)];
  if (input.belongYm) conditions.push(eq(salesFreelancer.belongYm, input.belongYm));
  if (input.businessCd) conditions.push(eq(salesFreelancer.businessCd, input.businessCd));
  if (input.q) {
    const q = `%${input.q}%`;
    conditions.push(or(ilike(salesFreelancer.sabun, q), ilike(salesFreelancer.name, q), ilike(salesFreelancer.pjtNm, q))!);
  }

  const rows = await db
    .select()
    .from(salesFreelancer)
    .where(and(...conditions))
    .orderBy(desc(salesFreelancer.belongYm), salesFreelancer.sabun)
    .limit(MAX_EXPORT_ROWS);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows: SalesFreelancerRow[] = rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    sabun: r.sabun,
    name: r.name ?? null,
    resNo: r.resNo ?? null,
    pjtCd: r.pjtCd ?? null,
    pjtNm: r.pjtNm ?? null,
    sdate: r.sdate ?? null,
    edate: r.edate ?? null,
    addr: r.addr ?? null,
    tel: r.tel ?? null,
    mailId: r.mailId ?? null,
    belongYm: r.belongYm,
    businessCd: r.businessCd,
    totMon: r.totMon ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: freelancerVisibleExportColumns as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "프리랜서투입현황",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.freelancer.export",
    resourceType: "sales_freelancer",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename: `freelancers_${format(new Date(), "yyyy-MM-dd")}.xlsx`, bytes: new Uint8Array(buf) };
}
