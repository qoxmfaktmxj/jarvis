"use server";

import { format } from "date-fns";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, salesPlanPerf } from "@jarvis/db/schema";
import { ListPlanPerfUploadInput } from "@jarvis/shared/validation/sales-charts";
import { exportToExcel, EXPORT_ROW_LIMIT, enforceExportLimit } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";
import { resolveSalesContext } from "../../_lib/sales-context";

type ExportInput = Omit<z.input<typeof ListPlanPerfUploadInput>, "page" | "limit">;

const TEMPLATE_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "ym", label: "년월(YYYYMM)", type: "text" },
  { key: "orgCd", label: "조직코드", type: "text" },
  { key: "orgNm", label: "조직명", type: "text" },
  { key: "gubunCd", label: "구분(PLAN/ACTUAL/FORECAST)", type: "text" },
  { key: "trendGbCd", label: "값구분(SALES/GROSS_PROFIT/OP_INCOME)", type: "text" },
  { key: "amt", label: "금액", type: "numeric" },
  { key: "note", label: "비고", type: "text" },
];

export async function exportPlanPerfUploadToExcel(rawFilters: ExportInput) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const input = ListPlanPerfUploadInput.parse({ ...rawFilters, page: 1, limit: 50 });
  const conditions = [eq(salesPlanPerf.workspaceId, ctx.workspaceId)];
  if (input.ym) conditions.push(eq(salesPlanPerf.ym, input.ym));
  if (input.orgCd) conditions.push(eq(salesPlanPerf.orgCd, input.orgCd));
  if (input.gubunCd) conditions.push(eq(salesPlanPerf.gubunCd, input.gubunCd));
  if (input.trendGbCd) conditions.push(eq(salesPlanPerf.trendGbCd, input.trendGbCd));
  if (input.q) {
    conditions.push(
      or(
        ilike(salesPlanPerf.orgCd, `%${input.q}%`),
        ilike(salesPlanPerf.orgNm, `%${input.q}%`),
        ilike(salesPlanPerf.note, `%${input.q}%`),
      )!,
    );
  }

  const rowsWithSentinel = await db.select().from(salesPlanPerf).where(and(...conditions))
    .orderBy(desc(salesPlanPerf.ym), salesPlanPerf.orgCd)
    .limit(EXPORT_ROW_LIMIT + 1);
  const guard = enforceExportLimit(rowsWithSentinel);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const exportRows = guard.rows.map((r) => ({
    ym: r.ym,
    orgCd: r.orgCd,
    orgNm: r.orgNm,
    gubunCd: r.gubunCd,
    trendGbCd: r.trendGbCd,
    amt: r.amt,
    note: r.note ?? "",
  }));

  const buf = await exportToExcel({
    rows: exportRows,
    columns: TEMPLATE_COLUMNS,
    sheetName: "계획실적전망",
  });

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.plan_perf_upload.export",
    resourceType: "sales_plan_perf",
    resourceId: null,
    details: { count: guard.rows.length, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return {
    ok: true as const,
    filename: `plan_perf_upload_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}

/** 빈 템플릿 다운로드 (헤더만 있는 xlsx). LoadExcel 후 사용자가 채워서 업로드. */
export async function downloadPlanPerfTemplate() {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const buf = await exportToExcel({
    rows: [],
    columns: TEMPLATE_COLUMNS,
    sheetName: "계획실적전망 (template)",
  });
  return {
    ok: true as const,
    filename: `plan_perf_template_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
