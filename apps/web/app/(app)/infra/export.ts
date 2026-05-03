"use server";
/**
 * apps/web/app/(app)/infra/export.ts
 *
 * 인프라구성관리 (Plan 5) Excel 내보내기 server action.
 *
 * 권한: INFRA_READ.
 * 시트명: 인프라 자산
 * 파일명: infra-systems_{date}.xlsx
 *
 * Audit: infra.system.export
 */
import { cookies, headers } from "next/headers";
import { and, eq, ilike, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, company, infraSystem, wikiPageIndex } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  exportInfraSystemsInput,
  type InfraSystemListRow,
} from "@jarvis/shared/validation/infra/system";
import {
  EXPORT_ROW_LIMIT,
  enforceExportLimit,
  exportToExcel,
} from "@/lib/server/export-excel";
import type { ColumnDef } from "@/components/grid/types";
import type { z } from "zod";

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

const EXPORT_COLUMNS: ColumnDef<InfraSystemListRow>[] = [
  { key: "companyName", label: "회사", type: "readonly" },
  { key: "systemName", label: "시스템", type: "readonly" },
  { key: "envType", label: "환경", type: "readonly" },
  { key: "dbType", label: "DB 종류", type: "readonly" },
  { key: "dbVersion", label: "DB 버전", type: "readonly" },
  { key: "osType", label: "OS", type: "readonly" },
  { key: "osVersion", label: "OS 버전", type: "readonly" },
  { key: "domainAddr", label: "도메인", type: "readonly" },
  { key: "port", label: "포트", type: "readonly" },
  { key: "connectMethod", label: "접속 방식", type: "readonly" },
  { key: "deployMethod", label: "배포 방식", type: "readonly" },
  { key: "deployFolder", label: "배포 폴더", type: "readonly" },
  { key: "ownerName", label: "담당자", type: "readonly" },
  { key: "ownerContact", label: "담당자 연락처", type: "readonly" },
  { key: "wikiPageRouteKey", label: "Runbook", type: "readonly" },
  { key: "note", label: "비고", type: "readonly" },
  { key: "createdAt", label: "등록일", type: "readonly" },
];

export async function exportInfraSystems(
  rawInput: z.input<typeof exportInfraSystemsInput>,
): Promise<{ ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string }> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.INFRA_READ)) {
    return { ok: false, error: "Forbidden" };
  }

  const input = exportInfraSystemsInput.parse(rawInput);

  const where = and(
    eq(infraSystem.workspaceId, session.workspaceId),
    input.companyId ? eq(infraSystem.companyId, input.companyId) : undefined,
    input.envType ? eq(infraSystem.envType, input.envType) : undefined,
    input.dbType ? eq(infraSystem.dbType, input.dbType) : undefined,
    input.q
      ? or(
          ilike(infraSystem.systemName, `%${input.q}%`),
          ilike(infraSystem.domainAddr, `%${input.q}%`),
          ilike(infraSystem.ownerName, `%${input.q}%`),
          ilike(company.name, `%${input.q}%`),
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: infraSystem.id,
      companyId: infraSystem.companyId,
      companyName: company.name,
      systemName: infraSystem.systemName,
      envType: infraSystem.envType,
      domainAddr: infraSystem.domainAddr,
      port: infraSystem.port,
      dbType: infraSystem.dbType,
      dbVersion: infraSystem.dbVersion,
      osType: infraSystem.osType,
      osVersion: infraSystem.osVersion,
      connectMethod: infraSystem.connectMethod,
      deployMethod: infraSystem.deployMethod,
      deployFolder: infraSystem.deployFolder,
      ownerName: infraSystem.ownerName,
      ownerContact: infraSystem.ownerContact,
      wikiPageId: infraSystem.wikiPageId,
      wikiPageRouteKey: wikiPageIndex.routeKey,
      wikiPageTitle: wikiPageIndex.title,
      note: infraSystem.note,
      sensitivity: infraSystem.sensitivity,
      createdAt: infraSystem.createdAt,
      updatedAt: infraSystem.updatedAt,
      createdBy: infraSystem.createdBy,
      updatedBy: infraSystem.updatedBy,
    })
    .from(infraSystem)
    .leftJoin(company, eq(company.id, infraSystem.companyId))
    .leftJoin(wikiPageIndex, eq(wikiPageIndex.id, infraSystem.wikiPageId))
    .where(where)
    .orderBy(infraSystem.systemName)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rows);
  if (!guard.ok) return { ok: false, error: guard.error };

  const serialized: InfraSystemListRow[] = guard.rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.companyName ?? null,
    systemName: r.systemName,
    envType: r.envType,
    domainAddr: r.domainAddr,
    port: r.port,
    dbType: r.dbType,
    dbVersion: r.dbVersion,
    osType: r.osType,
    osVersion: r.osVersion,
    connectMethod: r.connectMethod,
    deployMethod: r.deployMethod,
    deployFolder: r.deployFolder,
    ownerName: r.ownerName,
    ownerContact: r.ownerContact,
    wikiPageId: r.wikiPageId,
    wikiPageRouteKey: r.wikiPageRouteKey ?? null,
    wikiPageTitle: r.wikiPageTitle ?? null,
    note: r.note,
    sensitivity: r.sensitivity as InfraSystemListRow["sensitivity"],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  }));

  const buf = await exportToExcel({
    rows: serialized as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "인프라 자산",
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `infra-systems_${date}.xlsx`;

  await db.insert(auditLog).values({
    workspaceId: session.workspaceId,
    userId: session.userId,
    action: "infra.system.export",
    resourceType: "infra_system",
    resourceId: null,
    details: { export: true, filters: input } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, bytes: new Uint8Array(buf), filename };
}
