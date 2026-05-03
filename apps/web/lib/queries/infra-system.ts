/**
 * apps/web/lib/queries/infra-system.ts
 *
 * 인프라구성관리 (Plan 5) read-only 쿼리.
 * `/infra` Grid RSC 페이지 + Grid container에서 사용.
 *
 * 쓰기/감사 로깅은 actions.ts (`saveInfraSystems`, `linkRunbook`)에서 담당.
 *
 * Sensitivity: Plan 5 사용자 결정 — INFRA_*  RBAC로 통제하므로 row sensitivity는
 * 메타데이터로만 두고 쿼리 WHERE에서 필터하지 않는다 (`05-infra-hybrid-grid.md`).
 */
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { company, infraSystem, wikiPageIndex } from "@jarvis/db/schema";

export type InfraSystemListItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  systemName: string;
  envType: string | null;
  domainAddr: string | null;
  port: number | null;
  dbType: string | null;
  dbVersion: string | null;
  osType: string | null;
  osVersion: string | null;
  connectMethod: string | null;
  deployMethod: string | null;
  deployFolder: string | null;
  ownerName: string | null;
  ownerContact: string | null;
  wikiPageId: string | null;
  wikiPageRouteKey: string | null;
  wikiPageTitle: string | null;
  note: string | null;
  sensitivity: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";
  createdAt: string;
  updatedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ListInfraSystemsFilters = {
  q?: string;
  companyId?: string;
  envType?: string;
  dbType?: string;
  page?: number;
  limit?: number;
};

export async function listInfraSystems(
  workspaceId: string,
  filters: ListInfraSystemsFilters = {},
): Promise<{ rows: InfraSystemListItem[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const where = and(
    eq(infraSystem.workspaceId, workspaceId),
    filters.companyId ? eq(infraSystem.companyId, filters.companyId) : undefined,
    filters.envType ? eq(infraSystem.envType, filters.envType) : undefined,
    filters.dbType ? eq(infraSystem.dbType, filters.dbType) : undefined,
    filters.q
      ? or(
          ilike(infraSystem.systemName, `%${filters.q}%`),
          ilike(infraSystem.domainAddr, `%${filters.q}%`),
          ilike(infraSystem.ownerName, `%${filters.q}%`),
          ilike(company.name, `%${filters.q}%`),
        )
      : undefined,
  );

  const [rows, totalRows] = await Promise.all([
    db
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
      .orderBy(asc(company.code), asc(infraSystem.systemName), desc(infraSystem.envType))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(infraSystem)
      .leftJoin(company, eq(company.id, infraSystem.companyId))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
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
      sensitivity: r.sensitivity as InfraSystemListItem["sensitivity"],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      createdBy: r.createdBy,
      updatedBy: r.updatedBy,
    })),
    total: Number(totalRows[0]?.total ?? 0),
  };
}

export async function getInfraSystemById(
  workspaceId: string,
  id: string,
): Promise<InfraSystemListItem | null> {
  const [row] = await db
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
    .where(and(eq(infraSystem.workspaceId, workspaceId), eq(infraSystem.id, id)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName ?? null,
    systemName: row.systemName,
    envType: row.envType,
    domainAddr: row.domainAddr,
    port: row.port,
    dbType: row.dbType,
    dbVersion: row.dbVersion,
    osType: row.osType,
    osVersion: row.osVersion,
    connectMethod: row.connectMethod,
    deployMethod: row.deployMethod,
    deployFolder: row.deployFolder,
    ownerName: row.ownerName,
    ownerContact: row.ownerContact,
    wikiPageId: row.wikiPageId,
    wikiPageRouteKey: row.wikiPageRouteKey ?? null,
    wikiPageTitle: row.wikiPageTitle ?? null,
    note: row.note,
    sensitivity: row.sensitivity as InfraSystemListItem["sensitivity"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}
