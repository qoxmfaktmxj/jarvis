"use server";
import { format } from "date-fns";
import { and, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomer, salesCustomerCharger, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { exportCustomersInput } from "@jarvis/shared/validation/sales/customer";
import type { z } from "zod";
import {
  EXPORT_ROW_LIMIT,
  enforceExportLimit,
  exportToExcel,
} from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";

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
// exportCustomersToExcel
// ---------------------------------------------------------------------------

export async function exportCustomersToExcel(
  rawFilters: z.input<typeof exportCustomersInput>,
): Promise<{ ok: true; filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = exportCustomersInput.parse(rawFilters);

  // Build WHERE conditions (same logic as listCustomers, no offset/limit)
  const conditions = [eq(salesCustomer.workspaceId, ctx.workspaceId)];
  if (input.q) conditions.push(ilike(salesCustomer.custNm, `%${input.q}%`));
  if (input.custCd) conditions.push(ilike(salesCustomer.custCd, `%${input.custCd}%`));
  if (input.custNm) conditions.push(ilike(salesCustomer.custNm, `%${input.custNm}%`));
  if (input.custKindCd) conditions.push(eq(salesCustomer.custKindCd, input.custKindCd));
  if (input.custDivCd) conditions.push(eq(salesCustomer.custDivCd, input.custDivCd));
  if (input.chargerNm) {
    const chargerSubquery = db
      .selectDistinct({ customerId: salesCustomerCharger.customerId })
      .from(salesCustomerCharger)
      .where(
        and(
          eq(salesCustomerCharger.workspaceId, ctx.workspaceId),
          ilike(salesCustomerCharger.name, `%${input.chargerNm}%`),
        ),
      );
    conditions.push(inArray(salesCustomer.id, chargerSubquery));
  }
  if (input.searchYmdFrom) {
    conditions.push(gte(salesCustomer.createdAt, new Date(input.searchYmdFrom + "T00:00:00+09:00")));
  }
  if (input.searchYmdTo) {
    const toDate = new Date(input.searchYmdTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(salesCustomer.createdAt, toDate));
  }

  const rows = await db
    .select()
    .from(salesCustomer)
    .where(and(...conditions))
    .orderBy(salesCustomer.custCd)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rows);
  if (!guard.ok) return { ok: false, error: guard.error };

  // Hidden:0 (visible) columns per legacy ibSheet bizActCustCompanyMgr.jsp.
  // Pass resolved Korean display strings — NOT i18n keys.
  const EXPORT_COLUMNS: ColumnDef<CustomerRow>[] = [
    { key: "custNm", label: "고객명", type: "text" },
    { key: "custKindCd", label: "고객종류", type: "text" },
    { key: "custDivCd", label: "고객구분", type: "text" },
    { key: "ceoNm", label: "대표자", type: "text" },
    { key: "telNo", label: "전화번호", type: "text" },
    { key: "createdAt", label: "등록일자", type: "text" },
  ];

  const exportRows: CustomerRow[] = guard.rows.map((r) => ({
    id: r.id,
    custCd: r.custCd,
    custNm: r.custNm,
    custKindCd: r.custKindCd ?? null,
    custDivCd: r.custDivCd ?? null,
    exchangeTypeCd: r.exchangeTypeCd ?? null,
    custSourceCd: r.custSourceCd ?? null,
    custImprCd: r.custImprCd ?? null,
    buyInfoCd: r.buyInfoCd ?? null,
    buyInfoDtCd: r.buyInfoDtCd ?? null,
    ceoNm: r.ceoNm ?? null,
    telNo: r.telNo ?? null,
    businessNo: r.businessNo ?? null,
    faxNo: r.faxNo ?? null,
    businessKind: r.businessKind ?? null,
    homepage: r.homepage ?? null,
    addrNo: r.addrNo ?? null,
    addr1: r.addr1 ?? null,
    addr2: r.addr2 ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const buf = await exportToExcel({
    rows: exportRows as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "고객사",
  });

  const filename = `customers_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  // Audit log for export
  // TODO: add 'sales.customer.export' or 'EXPORT' to audit action enum when it is formalized
  await db.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: "sales.customer.export",
    resourceType: "sales_customer",
    resourceId: null,
    details: { export: true, filters: input } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, filename, bytes: new Uint8Array(buf) };
}
