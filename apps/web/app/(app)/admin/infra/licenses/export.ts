"use server";
/**
 * apps/web/app/(app)/admin/infra/licenses/export.ts
 *
 * 인프라 라이선스 Excel 내보내기 server action.
 *
 * 권한: ADMIN_ALL (listInfraLicenses와 동일).
 * 시트명: 회사 라이센스
 * 파일명: infra-licenses_{date}.xlsx
 */
import { cookies, headers } from "next/headers";
import { and, eq, ilike, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, infraLicense } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  exportInfraLicensesInput,
  type InfraLicenseRow,
} from "@jarvis/shared/validation/infra/license";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";

const MAX_EXPORT_ROWS = 50_000;

// ---------------------------------------------------------------------------
// Session helpers (mirrors actions.ts)
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

// ---------------------------------------------------------------------------
// Column definitions for Excel export
// Keys match InfraLicenseRow; labels are display strings (post-i18n).
// ---------------------------------------------------------------------------
const EXPORT_COLUMNS: ColumnDef<InfraLicenseRow>[] = [
  { key: "legacyCompanyCd", label: "회사코드", type: "readonly" },
  { key: "legacyCompanyNm", label: "회사명", type: "readonly" },
  { key: "symd", label: "시작일", type: "readonly" },
  { key: "eymd", label: "종료일", type: "readonly" },
  { key: "devGbCode", label: "환경", type: "readonly" },
  { key: "domainAddr", label: "도메인", type: "readonly" },
  { key: "ipAddr", label: "IP", type: "readonly" },
  { key: "userCnt", label: "사용자수", type: "readonly" },
  { key: "corpCnt", label: "법인수", type: "readonly" },
  { key: "empYn", label: "채용", type: "readonly" },
  { key: "hrYn", label: "인사", type: "readonly" },
  { key: "orgYn", label: "조직", type: "readonly" },
  { key: "eduYn", label: "교육", type: "readonly" },
  { key: "papYn", label: "급여", type: "readonly" },
  { key: "carYn", label: "차량", type: "readonly" },
  { key: "cpnYn", label: "쿠폰", type: "readonly" },
  { key: "timYn", label: "근태", type: "readonly" },
  { key: "benYn", label: "복지", type: "readonly" },
  { key: "appYn", label: "앱", type: "readonly" },
  { key: "eisYn", label: "EIS", type: "readonly" },
  { key: "sysYn", label: "시스템", type: "readonly" },
  { key: "yearYn", label: "연말정산", type: "readonly" },
  { key: "boardYn", label: "게시판", type: "readonly" },
  { key: "wlYn", label: "워크플로우", type: "readonly" },
  { key: "pdsYn", label: "자료실", type: "readonly" },
  { key: "idpYn", label: "IDP", type: "readonly" },
  { key: "abhrYn", label: "AB-HR", type: "readonly" },
  { key: "workYn", label: "작업관리", type: "readonly" },
  { key: "secYn", label: "보안", type: "readonly" },
  { key: "docYn", label: "전자결재", type: "readonly" },
  { key: "disYn", label: "파견", type: "readonly" },
  { key: "createdAt", label: "등록일자", type: "readonly" },
];

// ---------------------------------------------------------------------------
// exportInfraLicenses
// ---------------------------------------------------------------------------
export async function exportInfraLicenses(
  rawInput: z.input<typeof exportInfraLicensesInput>,
): Promise<{ ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string }> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { ok: false, error: "Forbidden" };
  }

  const input = exportInfraLicensesInput.parse(rawInput);
  const effectiveDevGbCode = input.searchDevGbCd || input.devGbCode;

  const where = and(
    eq(infraLicense.workspaceId, session.workspaceId),
    effectiveDevGbCode ? eq(infraLicense.devGbCode, effectiveDevGbCode) : undefined,
    input.companyId ? eq(infraLicense.companyId, input.companyId) : undefined,
    input.q
      ? or(
          ilike(infraLicense.legacyCompanyCd, `%${input.q}%`),
          ilike(infraLicense.legacyCompanyNm, `%${input.q}%`),
          ilike(infraLicense.domainAddr, `%${input.q}%`),
          ilike(infraLicense.ipAddr, `%${input.q}%`),
        )
      : undefined,
  );

  const rows = await db
    .select()
    .from(infraLicense)
    .where(where)
    .orderBy(infraLicense.symd);

  if (rows.length >= MAX_EXPORT_ROWS) {
    return { ok: false, error: `Export exceeds ${MAX_EXPORT_ROWS} rows. Refine your filter.` };
  }

  // Serialize to InfraLicenseRow shape (same as serialize() in actions.ts)
  const serialized: InfraLicenseRow[] = rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    legacyCompanyCd: r.legacyCompanyCd ?? null,
    legacyCompanyNm: r.legacyCompanyNm ?? null,
    symd: r.symd,
    eymd: r.eymd ?? null,
    devGbCode: r.devGbCode,
    domainAddr: r.domainAddr ?? null,
    ipAddr: r.ipAddr ?? null,
    userCnt: r.userCnt ?? null,
    corpCnt: r.corpCnt ?? null,
    empYn: r.empYn,
    hrYn: r.hrYn,
    orgYn: r.orgYn,
    eduYn: r.eduYn,
    papYn: r.papYn,
    carYn: r.carYn,
    cpnYn: r.cpnYn,
    timYn: r.timYn,
    benYn: r.benYn,
    appYn: r.appYn,
    eisYn: r.eisYn,
    sysYn: r.sysYn,
    yearYn: r.yearYn,
    boardYn: r.boardYn,
    wlYn: r.wlYn,
    pdsYn: r.pdsYn,
    idpYn: r.idpYn,
    abhrYn: r.abhrYn,
    workYn: r.workYn,
    secYn: r.secYn,
    docYn: r.docYn,
    disYn: r.disYn,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: serialized as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "회사 라이센스",
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `infra-licenses_${date}.xlsx`;

  // Audit log for export (mirrors infra.license.create/update/delete in actions.ts)
  await db.insert(auditLog).values({
    workspaceId: session.workspaceId,
    userId: session.userId,
    action: "infra.license.export",
    resourceType: "infra_license",
    resourceId: null,
    details: { export: true, filters: input } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, bytes: new Uint8Array(buf), filename };
}
