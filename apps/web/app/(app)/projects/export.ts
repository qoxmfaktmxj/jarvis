"use server";
/**
 * apps/web/app/(app)/projects/export.ts
 *
 * /projects DataGrid — Excel 내보내기 server action.
 *
 * 권한: PROJECT_READ.
 * 시트명: 프로젝트
 * 파일명: projects_{date}.xlsx
 *
 * Audit: project.export
 */
import { cookies, headers } from "next/headers";
import { and, eq, ilike, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, company, project, user } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  exportProjectsInput,
  type ProjectListRow,
} from "@jarvis/shared/validation/project";
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

const EXPORT_COLUMNS: ColumnDef<ProjectListRow>[] = [
  { key: "companyCode", label: "회사 코드", type: "readonly" },
  { key: "companyName", label: "회사명", type: "readonly" },
  { key: "name", label: "프로젝트", type: "readonly" },
  { key: "status", label: "상태", type: "readonly" },
  { key: "ownerName", label: "담당자", type: "readonly" },
  { key: "prodConnectType", label: "운영 접속", type: "readonly" },
  { key: "prodDomainUrl", label: "운영 도메인", type: "readonly" },
  { key: "devConnectType", label: "개발 접속", type: "readonly" },
  { key: "devDomainUrl", label: "개발 도메인", type: "readonly" },
  { key: "description", label: "설명", type: "readonly" },
  { key: "createdAt", label: "등록일", type: "readonly" },
  { key: "updatedAt", label: "수정일", type: "readonly" },
];

export async function exportProjects(
  rawInput: z.input<typeof exportProjectsInput>,
): Promise<{ ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string }> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return { ok: false, error: "Forbidden" };
  }

  const input = exportProjectsInput.parse(rawInput);

  const where = and(
    eq(project.workspaceId, session.workspaceId),
    input.status ? eq(project.status, input.status) : undefined,
    input.connectType
      ? or(
          eq(project.prodConnectType, input.connectType),
          eq(project.devConnectType, input.connectType),
        )
      : undefined,
    input.q
      ? or(
          ilike(project.name, `%${input.q}%`),
          ilike(project.description, `%${input.q}%`),
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: project.id,
      companyId: project.companyId,
      companyCode: company.code,
      companyName: company.name,
      name: project.name,
      status: project.status,
      ownerId: project.ownerId,
      ownerName: user.name,
      description: project.description,
      prodConnectType: project.prodConnectType,
      prodDomainUrl: project.prodDomainUrl,
      devConnectType: project.devConnectType,
      devDomainUrl: project.devDomainUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .leftJoin(company, eq(company.id, project.companyId))
    .leftJoin(user, eq(user.id, project.ownerId))
    .where(where)
    .orderBy(project.name)
    .limit(EXPORT_ROW_LIMIT + 1);

  const guard = enforceExportLimit(rows);
  if (!guard.ok) return { ok: false, error: guard.error };

  const serialized: ProjectListRow[] = guard.rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyCode: r.companyCode ?? null,
    companyName: r.companyName ?? null,
    name: r.name,
    status: (r.status as "active" | "deprecated" | "decommissioned") ?? "active",
    ownerId: r.ownerId ?? null,
    ownerName: r.ownerName ?? null,
    description: r.description ?? null,
    prodConnectType: (r.prodConnectType as "IP" | "VPN" | "VDI" | "RE" | null) ?? null,
    prodDomainUrl: r.prodDomainUrl ?? null,
    devConnectType: (r.devConnectType as "IP" | "VPN" | "VDI" | "RE" | null) ?? null,
    devDomainUrl: r.devDomainUrl ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));

  const buf = await exportToExcel({
    rows: serialized as unknown as Record<string, unknown>[],
    columns: EXPORT_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[],
    sheetName: "프로젝트",
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `projects_${date}.xlsx`;

  await db.insert(auditLog).values({
    workspaceId: session.workspaceId,
    userId: session.userId,
    action: "project.export",
    resourceType: "project",
    resourceId: null,
    details: { export: true, filters: input } as Record<string, unknown>,
    success: true,
  });

  return { ok: true, bytes: new Uint8Array(buf), filename };
}
