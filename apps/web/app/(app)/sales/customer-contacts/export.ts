"use server";
import { cookies, headers } from "next/headers";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesCustomerContact, salesCustomer, auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { exportCustomerContactsInput } from "@jarvis/shared/validation/sales/customer-contact";
import { exportToExcel } from "@/lib/server/export-excel";
import type { z } from "zod";
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

type ExportRow = {
  custNm: string | null;
  custName: string | null;
  jikweeNm: string | null;
  orgNm: string | null;
  telNo: string | null;
  hpNo: string | null;
  email: string | null;
  createdAt: string | null;
};

// Column definitions with resolved display labels (post-t() — no i18n keys here).
// Matches COLUMNS in CustomerContactsGridContainer (Hidden:0 per legacy bizActCustomerMgr.jsp:207~220).
const EXPORT_COLUMNS: ColumnDef<ExportRow>[] = [
  { key: "custNm", label: "고객사명", type: "readonly" },
  { key: "custName", label: "담당자명", type: "text" },
  { key: "jikweeNm", label: "직위", type: "text" },
  { key: "orgNm", label: "소속", type: "text" },
  { key: "telNo", label: "전화", type: "text" },
  { key: "hpNo", label: "휴대폰", type: "text" },
  { key: "email", label: "이메일", type: "text" },
  { key: "createdAt", label: "등록일자", type: "readonly" },
];

/**
 * Exports the full (unpaginated) customer-contact dataset matching the given
 * filters as an .xlsx file.
 *
 * Returns `{ filename, bytes }` where `bytes` is a `Uint8Array` (serialisable
 * across the RSC boundary). The caller (client component) passes `bytes` to
 * `triggerDownload(bytes, filename)`.
 *
 * Audit log: uses free-form action string `'sales.customer_contact.export'`
 * (audit_log.action is varchar(50), no enum restriction).
 * TODO: if a dedicated 'EXPORT' enum is added to audit_log.action, replace the string.
 */
export async function exportCustomerContactsToExcel(
  rawInput: z.input<typeof exportCustomerContactsInput>,
): Promise<{ filename: string; bytes: Uint8Array } | { ok: false; error: string }> {
  // Auth — same pattern as resolveSalesContext in actions.ts
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false, error: "Forbidden" };
  }
  const { workspaceId, userId } = session;

  // Parse + validate input
  const input = exportCustomerContactsInput.parse(rawInput);

  // Build WHERE (same logic as listCustomerContacts, no page/limit)
  const conditions = [eq(salesCustomerContact.workspaceId, workspaceId)];
  if (input.custMcd) conditions.push(ilike(salesCustomerContact.custMcd, `%${input.custMcd}%`));
  // custName covers "담당자명" search; chargerNm alias was removed (Approach A — UI writes custName key).
  if (input.custName) conditions.push(ilike(salesCustomerContact.custName, `%${input.custName}%`));
  if (input.customerId) conditions.push(eq(salesCustomerContact.customerId, input.customerId));
  if (input.hpNo) {
    conditions.push(ilike(salesCustomerContact.hpNo, `%${input.hpNo}%`));
  }
  if (input.email) {
    conditions.push(ilike(salesCustomerContact.email, `%${input.email}%`));
  }
  if (input.searchYmdFrom) {
    conditions.push(gte(salesCustomerContact.createdAt, new Date(input.searchYmdFrom)));
  }
  if (input.searchYmdTo) {
    const toDate = new Date(input.searchYmdTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(salesCustomerContact.createdAt, toDate));
  }

  const where = and(...conditions);

  // Fetch all matching rows (no pagination)
  const rows = await db
    .select({
      custNm: salesCustomer.custNm,
      custName: salesCustomerContact.custName,
      jikweeNm: salesCustomerContact.jikweeNm,
      orgNm: salesCustomerContact.orgNm,
      telNo: salesCustomerContact.telNo,
      hpNo: salesCustomerContact.hpNo,
      email: salesCustomerContact.email,
      createdAt: salesCustomerContact.createdAt,
    })
    .from(salesCustomerContact)
    .leftJoin(salesCustomer, eq(salesCustomer.id, salesCustomerContact.customerId))
    .where(where)
    .orderBy(salesCustomerContact.custMcd);

  const exportRows: ExportRow[] = rows.map((r) => ({
    custNm: r.custNm ?? null,
    custName: r.custName ?? null,
    jikweeNm: r.jikweeNm ?? null,
    orgNm: r.orgNm ?? null,
    telNo: r.telNo ?? null,
    hpNo: r.hpNo ?? null,
    email: r.email ?? null,
    createdAt: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : null,
  }));

  // Build xlsx Buffer
  const buf = await exportToExcel<ExportRow>({
    rows: exportRows,
    columns: EXPORT_COLUMNS,
    sheetName: "고객담당자",
  });

  // Audit log
  await db.insert(auditLog).values({
    workspaceId,
    userId,
    action: "sales.customer_contact.export",
    resourceType: "sales_customer_contact",
    details: { filters: input as Record<string, unknown>, rowCount: exportRows.length },
    success: true,
  });

  const today = new Date().toISOString().slice(0, 10);
  return {
    filename: `customer-contacts_${today}.xlsx`,
    bytes: new Uint8Array(buf),
  };
}
