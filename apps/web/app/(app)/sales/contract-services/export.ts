"use server";
import { format } from "date-fns";
import { and, eq, ilike, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContractService, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractServicesInput } from "@jarvis/shared/validation/sales-contract";
import type { z } from "zod";
import {
  EXPORT_ROW_LIMIT,
  enforceExportLimit,
  exportToExcel,
} from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { SalesContractServiceRow } from "@jarvis/shared/validation/sales-contract";

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
// exportContractServicesToExcel
// ---------------------------------------------------------------------------

type ExportInput = Omit<z.input<typeof listContractServicesInput>, "page" | "limit">;

export async function exportContractServicesToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listContractServicesInput.parse({ ...rawFilters, page: 1, limit: 200 });

  // Build WHERE conditions (same logic as listContractServices, no offset)
  const conditions = [eq(salesContractService.workspaceId, ctx.workspaceId)];
  if (input.q) {
    const orFilter = or(
      ilike(salesContractService.servName, `%${input.q}%`),
      ilike(salesContractService.job, `%${input.q}%`),
      ilike(salesContractService.servSabun, `%${input.q}%`),
    );
    if (orFilter) conditions.push(orFilter);
  }
  if (input.pjtCd) conditions.push(eq(salesContractService.pjtCd, input.pjtCd));
  if (input.attendCd) conditions.push(eq(salesContractService.attendCd, input.attendCd));

  const rows = await db
    .select()
    .from(salesContractService)
    .where(and(...conditions))
    .orderBy(salesContractService.symd, salesContractService.createdAt)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rows);
  if (!guard.ok) return { ok: false, error: guard.error };

  // Hidden:0 (visible) columns per legacy ibSheet contractServMgr.jsp
  const EXPORT_COLUMNS: ColumnDef<SalesContractServiceRow>[] = [
    { key: "orgCd", label: "담당팀명", type: "text" },
    { key: "manager", label: "대표담당자", type: "text" },
    { key: "pjtNm", label: "프로젝트", type: "text" },
    { key: "servSabun", label: "사번", type: "text" },
    { key: "servName", label: "이름", type: "text" },
    { key: "birYmd", label: "생년월일", type: "text" },
    { key: "cpyGbCd", label: "계약구분", type: "text" },
    { key: "cpyName", label: "업체명", type: "text" },
    { key: "econtAmt", label: "계약금액(월)", type: "text" },
    { key: "econtCnt", label: "계약차수", type: "text" },
    { key: "symd", label: "계약시작일", type: "text" },
    { key: "eymd", label: "계약종료일", type: "text" },
    { key: "etc1", label: "비고", type: "text" },
  ];

  const exportRows: SalesContractServiceRow[] = guard.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacySymd: r.legacySymd ?? null,
    legacyServSabun: r.legacyServSabun ?? null,
    servSabun: r.servSabun,
    servName: r.servName ?? null,
    birYmd: r.birYmd ?? null,
    symd: r.symd ?? null,
    eymd: r.eymd ?? null,
    cpyGbCd: r.cpyGbCd ?? null,
    cpyName: r.cpyName ?? null,
    econtAmt: r.econtAmt ?? null,
    econtCnt: r.econtCnt ?? null,
    job: r.job ?? null,
    tel: r.tel ?? null,
    mail: r.mail ?? null,
    addr: r.addr ?? null,
    attendCd: r.attendCd ?? null,
    skillCd: r.skillCd ?? null,
    cmmncCd: r.cmmncCd ?? null,
    rsponsCd: r.rsponsCd ?? null,
    memo1: r.memo1 ?? null,
    memo2: r.memo2 ?? null,
    memo3: r.memo3 ?? null,
    orgCd: r.orgCd ?? null,
    manager: r.manager ?? null,
    pjtCd: r.pjtCd ?? null,
    pjtNm: r.pjtNm ?? null,
    etc1: r.etc1 ?? null,
    etc2: r.etc2 ?? null,
    etc3: r.etc3 ?? null,
    etc4: r.etc4 ?? null,
    etc5: r.etc5 ?? null,
    etc6: r.etc6 ?? null,
    etc7: r.etc7 ?? null,
    etc8: r.etc8 ?? null,
    etc9: r.etc9 ?? null,
    etc10: r.etc10 ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "용역인원관리",
  });

  const filename = `contract_services_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.contract_service.export",
    resourceType: "sales_contract_service",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename, bytes: new Uint8Array(buf) };
}
