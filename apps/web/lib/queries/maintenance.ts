import { db } from "@jarvis/db/client";
import {
  maintenanceAssignment,
  user,
  company,
} from "@jarvis/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface MaintenanceRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmployeeId: string | null;
  companyId: string;
  companyName: string | null;
  startDate: string;
  endDate: string;
  contractNumber: string | null;
  contractType: string | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ListMaintenanceParams {
  workspaceId: string;
  q?: string;
  userId?: string;
  companyId?: string;
  contractType?: string;
  activeOn?: string;
  page?: number;
  limit?: number;
  database?: DbOrTx;
}

export async function listMaintenanceAssignments({
  workspaceId,
  q,
  userId,
  companyId,
  contractType,
  activeOn,
  page = 1,
  limit = 50,
  database = db,
}: ListMaintenanceParams): Promise<{
  data: MaintenanceRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(500, Math.max(1, limit));

  const conds = [eq(maintenanceAssignment.workspaceId, workspaceId)];

  if (userId) conds.push(eq(maintenanceAssignment.userId, userId));
  if (companyId) conds.push(eq(maintenanceAssignment.companyId, companyId));
  if (contractType) conds.push(eq(maintenanceAssignment.contractType, contractType));
  if (activeOn) {
    conds.push(lte(maintenanceAssignment.startDate, activeOn));
    conds.push(gte(maintenanceAssignment.endDate, activeOn));
  }
  if (q && q.trim().length > 0) {
    const escaped = escapeLike(q.trim());
    const pattern = `%${escaped}%`;
    conds.push(
      or(
        ilike(user.name, pattern),
        ilike(user.employeeId, pattern),
        ilike(company.name, pattern),
        ilike(maintenanceAssignment.contractNumber, pattern),
      )!,
    );
  }

  const rows = await database
    .select({
      id: maintenanceAssignment.id,
      userId: maintenanceAssignment.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      companyId: maintenanceAssignment.companyId,
      companyName: company.name,
      startDate: maintenanceAssignment.startDate,
      endDate: maintenanceAssignment.endDate,
      contractNumber: maintenanceAssignment.contractNumber,
      contractType: maintenanceAssignment.contractType,
      note: maintenanceAssignment.note,
      updatedBy: maintenanceAssignment.updatedBy,
      updatedAt: maintenanceAssignment.updatedAt,
      createdAt: maintenanceAssignment.createdAt,
    })
    .from(maintenanceAssignment)
    .leftJoin(user, eq(maintenanceAssignment.userId, user.id))
    .leftJoin(company, eq(maintenanceAssignment.companyId, company.id))
    .where(and(...conds))
    .orderBy(desc(maintenanceAssignment.startDate), asc(user.name))
    .limit(safeLimit)
    .offset((safePage - 1) * safeLimit);

  const [totals] = await database
    .select({ total: sql<number>`count(*)` })
    .from(maintenanceAssignment)
    .leftJoin(user, eq(maintenanceAssignment.userId, user.id))
    .leftJoin(company, eq(maintenanceAssignment.companyId, company.id))
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  const data: MaintenanceRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    companyId: r.companyId,
    companyName: r.companyName,
    startDate: r.startDate,
    endDate: r.endDate,
    contractNumber: r.contractNumber,
    contractType: r.contractType,
    note: r.note,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export async function getMaintenanceAssignment({
  workspaceId,
  id,
  database = db,
}: {
  workspaceId: string;
  id: string;
  database?: DbOrTx;
}): Promise<MaintenanceRow | null> {
  const [row] = await database
    .select({
      id: maintenanceAssignment.id,
      userId: maintenanceAssignment.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      companyId: maintenanceAssignment.companyId,
      companyName: company.name,
      startDate: maintenanceAssignment.startDate,
      endDate: maintenanceAssignment.endDate,
      contractNumber: maintenanceAssignment.contractNumber,
      contractType: maintenanceAssignment.contractType,
      note: maintenanceAssignment.note,
      updatedBy: maintenanceAssignment.updatedBy,
      updatedAt: maintenanceAssignment.updatedAt,
      createdAt: maintenanceAssignment.createdAt,
    })
    .from(maintenanceAssignment)
    .leftJoin(user, eq(maintenanceAssignment.userId, user.id))
    .leftJoin(company, eq(maintenanceAssignment.companyId, company.id))
    .where(
      and(
        eq(maintenanceAssignment.id, id),
        eq(maintenanceAssignment.workspaceId, workspaceId),
      ),
    );

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmployeeId: row.userEmployeeId,
    companyId: row.companyId,
    companyName: row.companyName,
    startDate: row.startDate,
    endDate: row.endDate,
    contractNumber: row.contractNumber,
    contractType: row.contractType,
    note: row.note,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export async function listAssignmentsByUser({
  workspaceId,
  userId,
  activeOn,
  database = db,
}: {
  workspaceId: string;
  userId: string;
  activeOn?: string;
  database?: DbOrTx;
}): Promise<MaintenanceRow[]> {
  const conds = [
    eq(maintenanceAssignment.workspaceId, workspaceId),
    eq(maintenanceAssignment.userId, userId),
  ];
  if (activeOn) {
    conds.push(lte(maintenanceAssignment.startDate, activeOn));
    conds.push(gte(maintenanceAssignment.endDate, activeOn));
  }

  const rows = await database
    .select({
      id: maintenanceAssignment.id,
      userId: maintenanceAssignment.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      companyId: maintenanceAssignment.companyId,
      companyName: company.name,
      startDate: maintenanceAssignment.startDate,
      endDate: maintenanceAssignment.endDate,
      contractNumber: maintenanceAssignment.contractNumber,
      contractType: maintenanceAssignment.contractType,
      note: maintenanceAssignment.note,
      updatedBy: maintenanceAssignment.updatedBy,
      updatedAt: maintenanceAssignment.updatedAt,
      createdAt: maintenanceAssignment.createdAt,
    })
    .from(maintenanceAssignment)
    .leftJoin(user, eq(maintenanceAssignment.userId, user.id))
    .leftJoin(company, eq(maintenanceAssignment.companyId, company.id))
    .where(and(...conds))
    .orderBy(desc(maintenanceAssignment.startDate), asc(company.name));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    companyId: r.companyId,
    companyName: r.companyName,
    startDate: r.startDate,
    endDate: r.endDate,
    contractNumber: r.contractNumber,
    contractType: r.contractType,
    note: r.note,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

export interface UserWithAssignmentCount {
  userId: string;
  employeeId: string;
  name: string;
  companyCount: number;
}

export async function listUsersWithAssignmentCounts({
  workspaceId,
  q,
  activeOn,
  database = db,
}: {
  workspaceId: string;
  q?: string;
  activeOn?: string;
  database?: DbOrTx;
}): Promise<UserWithAssignmentCount[]> {
  const userConds = [eq(user.workspaceId, workspaceId)];
  if (q && q.trim().length > 0) {
    const escaped = escapeLike(q.trim());
    const pattern = `%${escaped}%`;
    userConds.push(or(ilike(user.name, pattern), ilike(user.employeeId, pattern))!);
  }

  const assignmentConds = [eq(maintenanceAssignment.workspaceId, workspaceId)];
  if (activeOn) {
    assignmentConds.push(lte(maintenanceAssignment.startDate, activeOn));
    assignmentConds.push(gte(maintenanceAssignment.endDate, activeOn));
  }

  const rows = await database
    .select({
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      companyCount: sql<number>`count(distinct ${maintenanceAssignment.companyId})`,
    })
    .from(user)
    .innerJoin(
      maintenanceAssignment,
      and(eq(maintenanceAssignment.userId, user.id), ...assignmentConds.slice(1)),
    )
    .where(and(...userConds))
    .groupBy(user.id, user.employeeId, user.name)
    .orderBy(asc(user.name));

  return rows.map((r) => ({
    userId: r.userId,
    employeeId: r.employeeId,
    name: r.name,
    companyCount: Number(r.companyCount ?? 0),
  }));
}
