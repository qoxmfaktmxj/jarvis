"use server";
import { format } from "date-fns";
import { and, eq, ilike, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesContract, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractsInput } from "@jarvis/shared/validation/sales-contract";
import type { z } from "zod";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { SalesContractRow } from "@jarvis/shared/validation/sales-contract";

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
// exportContractsToExcel
// ---------------------------------------------------------------------------

type ExportInput = Omit<z.input<typeof listContractsInput>, "page" | "limit">;

export async function exportContractsToExcel(
  rawFilters: ExportInput,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listContractsInput.parse({ ...rawFilters, page: 1, limit: MAX_EXPORT_ROWS });

  // Build WHERE conditions (same logic as listContracts, no offset)
  const conditions = [eq(salesContract.workspaceId, ctx.workspaceId)];
  if (input.q) {
    const orFilter = or(
      ilike(salesContract.contNm, `%${input.q}%`),
      ilike(salesContract.companyNm, `%${input.q}%`),
      ilike(salesContract.legacyContNo, `%${input.q}%`),
    );
    if (orFilter) conditions.push(orFilter);
  }
  if (input.customerNo) conditions.push(eq(salesContract.customerNo, input.customerNo));
  if (input.contGbCd) conditions.push(eq(salesContract.contGbCd, input.contGbCd));

  const rows = await db
    .select()
    .from(salesContract)
    .where(and(...conditions))
    .orderBy(salesContract.contYmd, salesContract.createdAt);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  // Hidden:0 (visible) columns per legacy ibSheet bizContractMgr.jsp.
  // Pass resolved Korean display strings — NOT i18n keys.
  const EXPORT_COLUMNS: ColumnDef<SalesContractRow>[] = [
    { key: "newYn", label: "신규구분", type: "boolean" },
    { key: "contGbCd", label: "계약구분", type: "text" },
    { key: "mainContType", label: "계약형태", type: "text" },
    { key: "companyNm", label: "고객명", type: "text" },
    { key: "contNm", label: "계약명", type: "text" },
    { key: "updatedAt", label: "수정일자", type: "text" },
    { key: "companyNo", label: "고객 사업자번호", type: "text" },
    { key: "companyCd", label: "고객코드", type: "text" },
    { key: "companyGrpNm", label: "고객그룹명", type: "text" },
    { key: "companyType", label: "기업분류", type: "text" },
    { key: "inOutType", label: "내외구분", type: "text" },
    { key: "customerNo", label: "담당자번호", type: "text" },
    { key: "customerEmail", label: "담당자이메일", type: "text" },
    { key: "custNm", label: "거래처", type: "text" },
    { key: "legacyContYear", label: "귀속년도", type: "text" },
    { key: "contYmd", label: "계약일자", type: "text" },
    { key: "contSymd", label: "계약시작일", type: "text" },
    { key: "contEymd", label: "계약종료일", type: "text" },
    { key: "contInitYn", label: "계약갱신완료여부", type: "text" },
    { key: "createdAt", label: "계약등록일자", type: "text" },
  ];

  const exportRows: SalesContractRow[] = rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    legacyEnterCd: r.legacyEnterCd ?? null,
    legacyContYear: r.legacyContYear ?? null,
    legacyContNo: r.legacyContNo ?? null,
    companyType: r.companyType ?? null,
    companyCd: r.companyCd ?? null,
    companyGrpNm: r.companyGrpNm ?? null,
    companyNm: r.companyNm ?? null,
    companyNo: r.companyNo ?? null,
    customerNo: r.customerNo ?? null,
    customerEmail: r.customerEmail ?? null,
    contNm: r.contNm ?? null,
    custNm: r.custNm ?? null,
    contGbCd: r.contGbCd ?? null,
    contYmd: r.contYmd ?? null,
    contSymd: r.contSymd ?? null,
    contEymd: r.contEymd ?? null,
    mainContType: r.mainContType ?? null,
    newYn: r.newYn ?? null,
    inOutType: r.inOutType ?? null,
    startAmt: r.startAmt ?? null,
    startAmtRate: r.startAmtRate ?? null,
    interimAmt1: r.interimAmt1 ?? null,
    interimAmt2: r.interimAmt2 ?? null,
    interimAmt3: r.interimAmt3 ?? null,
    interimAmt4: r.interimAmt4 ?? null,
    interimAmt5: r.interimAmt5 ?? null,
    interimAmtRate1: r.interimAmtRate1 ?? null,
    interimAmtRate2: r.interimAmtRate2 ?? null,
    interimAmtRate3: r.interimAmtRate3 ?? null,
    interimAmtRate4: r.interimAmtRate4 ?? null,
    interimAmtRate5: r.interimAmtRate5 ?? null,
    remainAmt: r.remainAmt ?? null,
    remainAmtRate: r.remainAmtRate ?? null,
    contImplYn: r.contImplYn ?? null,
    contPublYn: r.contPublYn ?? null,
    contGrtRate: r.contGrtRate ?? null,
    advanImplYn: r.advanImplYn ?? null,
    advanPublYn: r.advanPublYn ?? null,
    advanGrtRate: r.advanGrtRate ?? null,
    defectImplYn: r.defectImplYn ?? null,
    defectPublYn: r.defectPublYn ?? null,
    defectGrtRate: r.defectGrtRate ?? null,
    defectEymd: r.defectEymd ?? null,
    inspecConfYmd: r.inspecConfYmd ?? null,
    startAmtPlanYmd: r.startAmtPlanYmd ?? null,
    startAmtPublYn: r.startAmtPublYn ?? null,
    interimAmtPlanYmd1: r.interimAmtPlanYmd1 ?? null,
    interimAmtPublYn1: r.interimAmtPublYn1 ?? null,
    interimAmtPlanYmd2: r.interimAmtPlanYmd2 ?? null,
    interimAmtPublYn2: r.interimAmtPublYn2 ?? null,
    interimAmtPlanYmd3: r.interimAmtPlanYmd3 ?? null,
    interimAmtPublYn3: r.interimAmtPublYn3 ?? null,
    interimAmtPlanYmd4: r.interimAmtPlanYmd4 ?? null,
    interimAmtPublYn4: r.interimAmtPublYn4 ?? null,
    interimAmtPlanYmd5: r.interimAmtPlanYmd5 ?? null,
    interimAmtPublYn5: r.interimAmtPublYn5 ?? null,
    remainAmtPlanYmd: r.remainAmtPlanYmd ?? null,
    remainAmtPublYn: r.remainAmtPublYn ?? null,
    befContNo: r.befContNo ?? null,
    contCancelYn: r.contCancelYn ?? null,
    contInitYn: r.contInitYn ?? null,
    fileSeq: r.fileSeq ?? null,
    docNo: r.docNo ?? null,
    companyAddr: r.companyAddr ?? null,
    companyOner: r.companyOner ?? null,
    sucProb: r.sucProb ?? null,
    memo: r.memo ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "계약관리",
  });

  const filename = `contracts_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.contract.export",
    resourceType: "sales_contract",
    resourceId: null,
    details: { export: true, filters: rawFilters } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename, bytes: new Uint8Array(buf) };
}
