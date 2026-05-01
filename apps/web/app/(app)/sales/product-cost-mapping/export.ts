"use server";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/export.ts
 *
 * Excel export server action for the product-cost-mapping screen.
 * Queries the full result set (no pagination limit) and returns a Buffer.
 *
 * Sheet name : 제품-비용 매핑
 * Filename   : product-cost-mapping_{YYYY-MM-DD}.xlsx
 *
 * Phase-Sales P2-A Task 7.5 (2026-05-01).
 */
import { cookies, headers } from "next/headers";
import { and, desc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  salesCostMaster,
  salesProductType,
  salesProductTypeCost,
} from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { exportProductCostMappingInput } from "@jarvis/shared/validation/sales/product-type-cost";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";

const MAX_EXPORT_ROWS = 50_000;

// ---------------------------------------------------------------------------
// Row type for Excel export
// ---------------------------------------------------------------------------
type ExportRow = {
  productTypeNm: string | null;
  costNm: string | null;
  sdate: string;
  edate: string | null;
  bizYn: boolean;
  note: string | null;
  createdAt: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Column definitions (display strings — Korean labels, no i18n needed server-side)
// ---------------------------------------------------------------------------
const EXPORT_COLUMNS: ColumnDef<ExportRow>[] = [
  { key: "productTypeNm", label: "제품군", type: "readonly" },
  { key: "costNm", label: "코스트", type: "readonly" },
  { key: "sdate", label: "시작일", type: "date" },
  { key: "edate", label: "종료일", type: "date" },
  { key: "bizYn", label: "영업 사용", type: "boolean" },
  { key: "note", label: "비고", type: "text" },
  { key: "createdAt", label: "등록일자", type: "readonly" },
];

// ---------------------------------------------------------------------------
// Session helper (inline — mirrors actions.ts pattern)
// ---------------------------------------------------------------------------
async function resolveSalesCtx() {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null;
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
}

// ---------------------------------------------------------------------------
// exportProductCostMappingToExcel
// ---------------------------------------------------------------------------
export async function exportProductCostMappingToExcel(
  rawInput: z.input<typeof exportProductCostMappingInput>,
): Promise<{ ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string }> {
  const ctx = await resolveSalesCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = exportProductCostMappingInput.parse(rawInput);

  const where = and(
    eq(salesProductTypeCost.workspaceId, ctx.workspaceId),
    input.productTypeId ? eq(salesProductTypeCost.productTypeId, input.productTypeId) : undefined,
    input.costId ? eq(salesProductTypeCost.costId, input.costId) : undefined,
    input.q
      ? or(
          ilike(salesProductType.productCd, `%${input.q}%`),
          ilike(salesProductType.productNm, `%${input.q}%`),
          ilike(salesCostMaster.costCd, `%${input.q}%`),
          ilike(salesCostMaster.costNm, `%${input.q}%`),
          ilike(salesProductTypeCost.note, `%${input.q}%`),
        )
      : undefined,
    // searchYmd: "row is valid on this date"
    input.searchYmd ? lte(salesProductTypeCost.sdate, input.searchYmd) : undefined,
    input.searchYmd
      ? or(
          gte(salesProductTypeCost.edate, input.searchYmd),
          isNull(salesProductTypeCost.edate),
        )
      : undefined,
    // searchCostNm: ILIKE on joined cost name
    input.searchCostNm
      ? ilike(salesCostMaster.costNm, `%${input.searchCostNm}%`)
      : undefined,
  );

  const rows = await db
    .select({
      productTypeNm: salesProductType.productNm,
      costNm: salesCostMaster.costNm,
      sdate: salesProductTypeCost.sdate,
      edate: salesProductTypeCost.edate,
      bizYn: salesProductTypeCost.bizYn,
      note: salesProductTypeCost.note,
      createdAt: salesProductTypeCost.createdAt,
    })
    .from(salesProductTypeCost)
    .leftJoin(salesProductType, eq(salesProductType.id, salesProductTypeCost.productTypeId))
    .leftJoin(salesCostMaster, eq(salesCostMaster.id, salesProductTypeCost.costId))
    .where(where)
    .orderBy(desc(salesProductTypeCost.sdate));

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  const exportRows: ExportRow[] = rows.map((r) => ({
    productTypeNm: r.productTypeNm ?? null,
    costNm: r.costNm ?? null,
    sdate: r.sdate ?? "",
    edate: r.edate ?? null,
    bizYn: r.bizYn,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const filename = `product-cost-mapping_${today}.xlsx`;

  const buffer = await exportToExcel<ExportRow>({
    rows: exportRows,
    columns: EXPORT_COLUMNS,
    sheetName: "제품-비용 매핑",
  });

  // Audit log — action is free-form varchar(50).
  // TODO: if a dedicated 'EXPORT' constant is standardized in auditLog.action, update here.
  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.product_type_cost.export",
    resourceType: "sales_product_type_cost",
    resourceId: null,
    details: {
      filename,
      rowCount: exportRows.length,
      filters: input,
    } as Record<string, unknown>,
    success: true,
  });

  return {
    ok: true,
    bytes: new Uint8Array(buffer),
    filename,
  };
}
