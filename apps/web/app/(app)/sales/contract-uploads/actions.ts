"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { format } from "date-fns";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  salesContract,
  salesContractMonth,
  salesContractUpload,
} from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listContractUploadsInput,
  saveContractUploadsInput,
  salesContractUploadRowSchema,
  type SalesContractUploadRow,
  type UnifiedContractUploadRow,
} from "@jarvis/shared/validation/sales-contract-extra";
import { exportToExcel } from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";

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

  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
}

function serializeUpload(row: typeof salesContractUpload.$inferSelect): SalesContractUploadRow {
  return salesContractUploadRowSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  });
}

export async function listContractUploads(rawInput: unknown): Promise<{
  ok: boolean;
  rows: SalesContractUploadRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [], total: 0, page: 1, limit: 50 };

  const input = listContractUploadsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;
  const conditions = [eq(salesContractUpload.workspaceId, ctx.workspaceId)];

  if (input.q) {
    const search = or(
      ilike(salesContractUpload.companyNm, `%${input.q}%`),
      ilike(salesContractUpload.pjtNm, `%${input.q}%`),
      ilike(salesContractUpload.companyCd, `%${input.q}%`),
      ilike(salesContractUpload.pjtCode, `%${input.q}%`),
    );
    if (search) conditions.push(search);
  }
  if (input.ym) conditions.push(eq(salesContractUpload.ym, input.ym));
  if (input.companyCd) conditions.push(eq(salesContractUpload.companyCd, input.companyCd));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(salesContractUpload)
      .where(where)
      .orderBy(desc(salesContractUpload.ym), desc(salesContractUpload.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ count: count() }).from(salesContractUpload).where(where),
  ]);

  return {
    ok: true,
    rows: rows.map(serializeUpload),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function listUnifiedContractUploads(rawInput: unknown): Promise<{
  ok: boolean;
  rows: UnifiedContractUploadRow[];
  error?: string;
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error, rows: [] };

  const input = listContractUploadsInput.parse({ ...(rawInput as object), page: 1, limit: 100 });
  const monthConditions = [eq(salesContractMonth.workspaceId, ctx.workspaceId)];
  const uploadConditions = [eq(salesContractUpload.workspaceId, ctx.workspaceId)];

  if (input.ym) {
    monthConditions.push(eq(salesContractMonth.ym, input.ym));
    uploadConditions.push(eq(salesContractUpload.ym, input.ym));
  }
  if (input.companyCd) {
    monthConditions.push(eq(salesContract.companyCd, input.companyCd));
    uploadConditions.push(eq(salesContractUpload.companyCd, input.companyCd));
  }
  if (input.q) {
    const monthSearch = or(
      ilike(salesContract.companyNm, `%${input.q}%`),
      ilike(salesContract.contNm, `%${input.q}%`),
      ilike(salesContract.companyCd, `%${input.q}%`),
    );
    const uploadSearch = or(
      ilike(salesContractUpload.companyNm, `%${input.q}%`),
      ilike(salesContractUpload.pjtNm, `%${input.q}%`),
      ilike(salesContractUpload.companyCd, `%${input.q}%`),
      ilike(salesContractUpload.pjtCode, `%${input.q}%`),
    );
    if (monthSearch) monthConditions.push(monthSearch);
    if (uploadSearch) uploadConditions.push(uploadSearch);
  }

  const [monthRows, uploadRows] = await Promise.all([
    db
      .select({
        id: salesContractMonth.id,
        ym: salesContractMonth.ym,
        companyCd: salesContract.companyCd,
        companyNm: salesContract.companyNm,
        pjtCode: salesContract.legacyContNo,
        pjtNm: salesContract.contNm,
        planServSaleAmt: salesContractMonth.planServSaleAmt,
        viewServSaleAmt: salesContractMonth.viewServSaleAmt,
        perfServSaleAmt: salesContractMonth.perfServSaleAmt,
      })
      .from(salesContractMonth)
      .innerJoin(salesContract, eq(salesContractMonth.contractId, salesContract.id))
      .where(and(...monthConditions))
      .orderBy(desc(salesContractMonth.ym))
      .limit(100),
    db
      .select({
        id: salesContractUpload.id,
        ym: salesContractUpload.ym,
        companyCd: salesContractUpload.companyCd,
        companyNm: salesContractUpload.companyNm,
        pjtCode: salesContractUpload.pjtCode,
        pjtNm: salesContractUpload.pjtNm,
        planServSaleAmt: salesContractUpload.planServSaleAmt,
        viewServSaleAmt: salesContractUpload.viewServSaleAmt,
        perfServSaleAmt: salesContractUpload.perfServSaleAmt,
      })
      .from(salesContractUpload)
      .where(and(...uploadConditions))
      .orderBy(desc(salesContractUpload.ym))
      .limit(100),
  ]);

  return {
    ok: true,
    rows: [
      ...monthRows.map((row) => ({ ...row, sourceTable: "031" as const })),
      ...uploadRows.map((row) => ({ ...row, sourceTable: "037" as const })),
    ].slice(0, 100),
  };
}

export async function saveContractUploads(rawInput: unknown): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  errors?: { code: string; message: string }[];
}> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [{ code: "UNAUTHORIZED", message: ctx.error }],
    };
  }

  const input = saveContractUploadsInput.parse(rawInput);
  const errors: { code: string; message: string }[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      if (input.creates.length > 0) {
        const inserted = await tx
          .insert(salesContractUpload)
          .values(
            input.creates.map((row) => ({
              ...row,
              workspaceId: ctx.workspaceId,
              createdBy: ctx.userId ?? undefined,
              updatedBy: ctx.userId ?? undefined,
            })),
          )
          .returning({ id: salesContractUpload.id });
        created = inserted.length;

        if (inserted.length > 0) {
          await tx.insert(auditLog).values(
            inserted.map((row) => ({
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              action: "sales.contract_upload.create",
              resourceType: "sales_contract_upload",
              resourceId: row.id,
              details: {} as Record<string, unknown>,
              success: true,
            })),
          );
        }
      }

      for (const update of input.updates) {
        const { id, ...patch } = update;
        const [row] = await tx
          .update(salesContractUpload)
          .set({
            ...patch,
            updatedBy: ctx.userId ?? undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(salesContractUpload.id, id), eq(salesContractUpload.workspaceId, ctx.workspaceId)))
          .returning({ id: salesContractUpload.id });

        if (row) {
          updated++;
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.contract_upload.update",
            resourceType: "sales_contract_upload",
            resourceId: row.id,
            details: patch as Record<string, unknown>,
            success: true,
          });
        }
      }

      if (input.deletes.length > 0) {
        const removed = await tx
          .delete(salesContractUpload)
          .where(
            and(
              eq(salesContractUpload.workspaceId, ctx.workspaceId),
              inArray(salesContractUpload.id, input.deletes),
            ),
          )
          .returning({ id: salesContractUpload.id });
        deleted = removed.length;
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    errors.push({ code: "SAVE_FAILED", message });
  }

  revalidatePath("/sales/contract-uploads");
  return {
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * 빈 템플릿 다운로드 (헤더만 있는 xlsx).
 *
 * 레거시 `planViewPerfUploadMgr.jsp`의 DownTemplate 액션 패리티. 사용자가
 * 다운로드한 템플릿을 채워서 다시 업로드하면 `salesContractUpload`에 적재된다.
 * 컬럼 헤더는 `_components/ContractUploadsGridContainer.tsx`의 `uploadColumns`와
 * 일치시켜 인라인 편집과 Excel 업로드의 입력 형식을 동일하게 유지한다.
 */
export async function downloadContractUploadTemplate(): Promise<
  | { ok: true; filename: string; bytes: Uint8Array }
  | { ok: false; error: string }
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const TEMPLATE_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
    { key: "ym", label: "년월(YYYYMM)", type: "text" },
    { key: "companyCd", label: "회사코드", type: "text" },
    { key: "companyNm", label: "회사명", type: "text" },
    { key: "costCd", label: "코스트코드", type: "text" },
    { key: "pjtCode", label: "프로젝트코드", type: "text" },
    { key: "pjtNm", label: "프로젝트명", type: "text" },
    { key: "productType", label: "제품군", type: "text" },
    { key: "contType", label: "계약유형", type: "text" },
    { key: "planServSaleAmt", label: "계획 서비스매출", type: "numeric" },
    { key: "viewServSaleAmt", label: "전망 서비스매출", type: "numeric" },
    { key: "perfServSaleAmt", label: "실적 서비스매출", type: "numeric" },
    { key: "note", label: "비고", type: "text" },
  ];

  const buf = await exportToExcel({
    rows: [],
    columns: TEMPLATE_COLUMNS,
    sheetName: "계약 업로드 (template)",
  });

  return {
    ok: true as const,
    filename: `contract_upload_template_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
