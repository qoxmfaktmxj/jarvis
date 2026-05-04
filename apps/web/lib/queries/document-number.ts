import { db } from "@jarvis/db/client";
import { documentNumber, user } from "@jarvis/db/schema";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface DocNumberRow {
  id: string;
  year: string;
  seq: number;
  docNo: string;
  docName: string;
  userId: string | null;
  userName: string | null;
  userEmployeeId: string | null;
  docDate: string | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ListDocNumberParams {
  workspaceId: string;
  q?: string;
  year?: string;
  page?: number;
  limit?: number;
  database?: DbOrTx;
}

export async function listDocumentNumbers({
  workspaceId,
  q,
  year,
  page = 1,
  limit = 50,
  database = db,
}: ListDocNumberParams): Promise<{
  data: DocNumberRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(500, Math.max(1, limit));

  const conds = [eq(documentNumber.workspaceId, workspaceId)];
  if (year) conds.push(eq(documentNumber.year, year));
  if (q && q.trim().length > 0) {
    const escaped = escapeLike(q.trim());
    conds.push(ilike(documentNumber.docName, `%${escaped}%`));
  }

  const rows = await database
    .select({
      id: documentNumber.id,
      year: documentNumber.year,
      seq: documentNumber.seq,
      docNo: documentNumber.docNo,
      docName: documentNumber.docName,
      userId: documentNumber.userId,
      userName: user.name,
      userEmployeeId: user.employeeId,
      docDate: documentNumber.docDate,
      note: documentNumber.note,
      updatedBy: documentNumber.updatedBy,
      updatedAt: documentNumber.updatedAt,
      createdAt: documentNumber.createdAt,
    })
    .from(documentNumber)
    .leftJoin(user, eq(documentNumber.userId, user.id))
    .where(and(...conds))
    .orderBy(desc(documentNumber.year), desc(documentNumber.seq))
    .limit(safeLimit)
    .offset((safePage - 1) * safeLimit);

  const [totals] = await database
    .select({ total: sql<number>`count(*)` })
    .from(documentNumber)
    .leftJoin(user, eq(documentNumber.userId, user.id))
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  const data: DocNumberRow[] = rows.map((r) => ({
    id: r.id,
    year: r.year,
    seq: r.seq,
    docNo: r.docNo,
    docName: r.docName,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    docDate: r.docDate,
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

/** 연도별 다음 seq = max(seq) + 1, 시작 1. 트랜잭션 내에서 호출 권장. */
export async function nextSeq({
  workspaceId,
  year,
  database = db,
}: {
  workspaceId: string;
  year: string;
  database?: DbOrTx;
}): Promise<number> {
  const [row] = await database
    .select({ max: sql<number>`COALESCE(max(${documentNumber.seq}), 0)` })
    .from(documentNumber)
    .where(
      and(
        eq(documentNumber.workspaceId, workspaceId),
        eq(documentNumber.year, year),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

export async function listAvailableYears({
  workspaceId,
  database = db,
}: {
  workspaceId: string;
  database?: DbOrTx;
}): Promise<string[]> {
  const rows = await database
    .selectDistinct({ year: documentNumber.year })
    .from(documentNumber)
    .where(eq(documentNumber.workspaceId, workspaceId))
    .orderBy(asc(documentNumber.year));
  return rows.map((r) => r.year);
}
