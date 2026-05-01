"use server";
import { format } from "date-fns";
import { and, eq, ilike } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContractMonth, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractMonthsInput } from "@jarvis/shared/validation/sales-contract";
import type { z } from "zod";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { SalesContractMonthRow } from "@jarvis/shared/validation/sales-contract";

const MAX_EXPORT_ROWS = 50_000;

// ---------------------------------------------------------------------------
// Session helpers (same pattern as actions.ts)
// ---------------------------------------------------------------------------

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

async function resolveSalesContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };

  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }

  const headerStore = await headers();
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

// ---------------------------------------------------------------------------
// exportContractMonthsToExcel
// ---------------------------------------------------------------------------

type ExportInput = Omit<z.input<typeof listContractMonthsInput>, "page" | "limit">;

export async function exportContractMonthsToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listContractMonthsInput.parse({ ...rawFilters, page: 1, limit: MAX_EXPORT_ROWS });

  // Build WHERE conditions (same logic as listContractMonths in actions.ts)
  const conditions = [eq(salesContractMonth.workspaceId, ctx.workspaceId)];
  if (input.q) conditions.push(ilike(salesContractMonth.note, `%${input.q}%`));
  if (input.contractId) conditions.push(eq(salesContractMonth.contractId, input.contractId));
  if (input.ym) conditions.push(eq(salesContractMonth.ym, input.ym));

  const rows = await db
    .select()
    .from(salesContractMonth)
    .where(and(...conditions))
    .orderBy(salesContractMonth.ym, salesContractMonth.createdAt);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  // Hidden:0 (visible) columns per legacy ibSheet bizContractMonthMgr.jsp.
  // Pass resolved Korean display strings — NOT i18n keys.
  const EXPORT_COLUMNS: ColumnDef<SalesContractMonthRow>[] = [
    { key: "ym", label: "년월", type: "text" },
    { key: "rfcEndYn", label: "실적생성마감", type: "text" },
    { key: "billTargetYn", label: "청구대상여부", type: "text" },
    // PLAN
    { key: "planServSaleAmt", label: "계획 수주금액(용역)", type: "numeric" },
    { key: "planProdSaleAmt", label: "계획 수주금액(상품)", type: "numeric" },
    { key: "planInfSaleAmt", label: "계획 수주금액(인프라)", type: "numeric" },
    { key: "planServInCostAmt", label: "계획 용역비(내부)", type: "numeric" },
    { key: "planServOutCostAmt", label: "계획 용역비(외부)", type: "numeric" },
    { key: "planProdCostAmt", label: "계획 상품원가", type: "numeric" },
    { key: "planRentAmt", label: "계획 임대료수입", type: "numeric" },
    { key: "planExpAmt", label: "계획 경비", type: "numeric" },
    { key: "planSgaAmt", label: "계획 판관비", type: "numeric" },
    { key: "planInCostAmt", label: "계획 직접비(내부)", type: "numeric" },
    { key: "planOutCostAmt", label: "계획 직접비(외부)", type: "numeric" },
    { key: "planIndirectGrpAmt", label: "계획 간접비(본부공통)", type: "numeric" },
    { key: "planIndirectComAmt", label: "계획 간접비(전사공통)", type: "numeric" },
    { key: "planInManMonth", label: "계획 내부M/M", type: "numeric" },
    { key: "planOutManMonth", label: "계획 외부M/M", type: "numeric" },
    // VIEW
    { key: "viewServSaleAmt", label: "예상 수주금액(용역)", type: "numeric" },
    { key: "viewProdSaleAmt", label: "예상 수주금액(상품)", type: "numeric" },
    { key: "viewInfSaleAmt", label: "예상 수주금액(인프라)", type: "numeric" },
    { key: "viewServInCostAmt", label: "예상 용역비(내부)", type: "numeric" },
    { key: "viewServOutCostAmt", label: "예상 용역비(외부)", type: "numeric" },
    { key: "viewProdCostAmt", label: "예상 상품원가", type: "numeric" },
    { key: "viewRentAmt", label: "예상 임대료수입", type: "numeric" },
    { key: "viewExpAmt", label: "예상 경비", type: "numeric" },
    { key: "viewSgaAmt", label: "예상 판관비", type: "numeric" },
    { key: "viewInCostAmt", label: "예상 직접비(내부)", type: "numeric" },
    { key: "viewOutCostAmt", label: "예상 직접비(외부)", type: "numeric" },
    { key: "viewIndirectGrpAmt", label: "예상 간접비(본부공통)", type: "numeric" },
    { key: "viewIndirectComAmt", label: "예상 간접비(전사공통)", type: "numeric" },
    { key: "viewInManMonth", label: "예상 내부M/M", type: "numeric" },
    { key: "viewOutManMonth", label: "예상 외부M/M", type: "numeric" },
    // PERF
    { key: "perfServSaleAmt", label: "실적 수주금액(용역)", type: "numeric" },
    { key: "perfProdSaleAmt", label: "실적 수주금액(상품)", type: "numeric" },
    { key: "perfInfSaleAmt", label: "실적 수주금액(인프라)", type: "numeric" },
    { key: "perfServInCostAmt", label: "실적 용역비(내부)", type: "numeric" },
    { key: "perfServOutCostAmt", label: "실적 용역비(외부)", type: "numeric" },
    { key: "perfProdCostAmt", label: "실적 상품원가", type: "numeric" },
    { key: "perfRentAmt", label: "실적 임대료수입", type: "numeric" },
    { key: "perfExpAmt", label: "실적 경비", type: "numeric" },
    { key: "perfSgaAmt", label: "실적 판관비", type: "numeric" },
    { key: "perfInCostAmt", label: "실적 직접비(내부)", type: "numeric" },
    { key: "perfOutCostAmt", label: "실적 직접비(외부)", type: "numeric" },
    { key: "perfIndirectGrpAmt", label: "실적 간접비(본부공통)", type: "numeric" },
    { key: "perfIndirectComAmt", label: "실적 간접비(전사공통)", type: "numeric" },
    { key: "perfInManMonth", label: "실적 내부M/M", type: "numeric" },
    { key: "perfOutManMonth", label: "실적 외부M/M", type: "numeric" },
    // Tax
    { key: "taxOrderAmt", label: "세금계산서수주금액", type: "numeric" },
    { key: "taxServAmt", label: "세금계산서용역금액", type: "numeric" },
    { key: "createdAt", label: "등록일자", type: "text" },
  ];

  const exportRows: SalesContractMonthRow[] = rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    contractId: r.contractId,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    legacySeq: r.legacySeq ?? null,
    legacyYm: r.legacyYm ?? null,
    ym: r.ym,
    billTargetYn: r.billTargetYn ?? null,
    // PLAN
    planInManMonth: r.planInManMonth ?? null,
    planOutManMonth: r.planOutManMonth ?? null,
    planServSaleAmt: r.planServSaleAmt ?? null,
    planProdSaleAmt: r.planProdSaleAmt ?? null,
    planInfSaleAmt: r.planInfSaleAmt ?? null,
    planServInCostAmt: r.planServInCostAmt ?? null,
    planServOutCostAmt: r.planServOutCostAmt ?? null,
    planProdCostAmt: r.planProdCostAmt ?? null,
    planInCostAmt: r.planInCostAmt ?? null,
    planOutCostAmt: r.planOutCostAmt ?? null,
    planIndirectGrpAmt: r.planIndirectGrpAmt ?? null,
    planIndirectComAmt: r.planIndirectComAmt ?? null,
    planRentAmt: r.planRentAmt ?? null,
    planSgaAmt: r.planSgaAmt ?? null,
    planExpAmt: r.planExpAmt ?? null,
    // VIEW
    viewInManMonth: r.viewInManMonth ?? null,
    viewOutManMonth: r.viewOutManMonth ?? null,
    viewServSaleAmt: r.viewServSaleAmt ?? null,
    viewProdSaleAmt: r.viewProdSaleAmt ?? null,
    viewInfSaleAmt: r.viewInfSaleAmt ?? null,
    viewServInCostAmt: r.viewServInCostAmt ?? null,
    viewServOutCostAmt: r.viewServOutCostAmt ?? null,
    viewProdCostAmt: r.viewProdCostAmt ?? null,
    viewInCostAmt: r.viewInCostAmt ?? null,
    viewOutCostAmt: r.viewOutCostAmt ?? null,
    viewIndirectGrpAmt: r.viewIndirectGrpAmt ?? null,
    viewIndirectComAmt: r.viewIndirectComAmt ?? null,
    viewRentAmt: r.viewRentAmt ?? null,
    viewSgaAmt: r.viewSgaAmt ?? null,
    viewExpAmt: r.viewExpAmt ?? null,
    // PERF
    perfInManMonth: r.perfInManMonth ?? null,
    perfOutManMonth: r.perfOutManMonth ?? null,
    perfServSaleAmt: r.perfServSaleAmt ?? null,
    perfProdSaleAmt: r.perfProdSaleAmt ?? null,
    perfInfSaleAmt: r.perfInfSaleAmt ?? null,
    perfServInCostAmt: r.perfServInCostAmt ?? null,
    perfServOutCostAmt: r.perfServOutCostAmt ?? null,
    perfProdCostAmt: r.perfProdCostAmt ?? null,
    perfInCostAmt: r.perfInCostAmt ?? null,
    perfOutCostAmt: r.perfOutCostAmt ?? null,
    perfIndirectGrpAmt: r.perfIndirectGrpAmt ?? null,
    perfIndirectComAmt: r.perfIndirectComAmt ?? null,
    perfRentAmt: r.perfRentAmt ?? null,
    perfSgaAmt: r.perfSgaAmt ?? null,
    perfExpAmt: r.perfExpAmt ?? null,
    // Tax
    taxOrderAmt: r.taxOrderAmt ?? null,
    taxServAmt: r.taxServAmt ?? null,
    // Finalize
    rfcEndYn: r.rfcEndYn ?? null,
    note: r.note ?? null,
    // Audit
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "계약월별관리",
  });

  const filename = `contract_months_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.contract_month.export",
    resourceType: "sales_contract_month",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename, bytes: new Uint8Array(buf) };
}
