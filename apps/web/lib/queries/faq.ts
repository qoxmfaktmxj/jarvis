import { db } from "@jarvis/db/client";
import { faqEntry } from "@jarvis/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface FaqRow {
  id: string;
  seq: number;
  bizCode: string | null;
  question: string;
  answer: string;
  fileSeq: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ListFaqParams {
  workspaceId: string;
  q?: string;
  bizCode?: string;
  page?: number;
  limit?: number;
  database?: DbOrTx;
}

export async function listFaq({
  workspaceId,
  q,
  bizCode,
  page = 1,
  limit = 50,
  database = db,
}: ListFaqParams): Promise<{
  data: FaqRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(500, Math.max(1, limit));

  const conds = [eq(faqEntry.workspaceId, workspaceId)];
  if (bizCode) conds.push(eq(faqEntry.bizCode, bizCode));
  if (q && q.trim().length > 0) {
    const escaped = escapeLike(q.trim());
    const pattern = `%${escaped}%`;
    conds.push(or(ilike(faqEntry.question, pattern), ilike(faqEntry.answer, pattern))!);
  }

  const rows = await database
    .select({
      id: faqEntry.id,
      seq: faqEntry.seq,
      bizCode: faqEntry.bizCode,
      question: faqEntry.question,
      answer: faqEntry.answer,
      fileSeq: faqEntry.fileSeq,
      updatedBy: faqEntry.updatedBy,
      updatedAt: faqEntry.updatedAt,
      createdAt: faqEntry.createdAt,
    })
    .from(faqEntry)
    .where(and(...conds))
    .orderBy(desc(faqEntry.seq))
    .limit(safeLimit)
    .offset((safePage - 1) * safeLimit);

  const [totals] = await database
    .select({ total: sql<number>`count(*)` })
    .from(faqEntry)
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  return {
    data: rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      bizCode: r.bizCode,
      question: r.question,
      answer: r.answer,
      fileSeq: r.fileSeq,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

/** workspace 내 다음 seq = max(seq) + 1 */
export async function nextFaqSeq({
  workspaceId,
  database = db,
}: {
  workspaceId: string;
  database?: DbOrTx;
}): Promise<number> {
  const [row] = await database
    .select({ max: sql<number>`COALESCE(max(${faqEntry.seq}), 0)` })
    .from(faqEntry)
    .where(eq(faqEntry.workspaceId, workspaceId));
  return Number(row?.max ?? 0) + 1;
}
