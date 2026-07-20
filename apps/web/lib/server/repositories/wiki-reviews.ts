import { and, count, desc, eq } from "drizzle-orm";
import { auditLog, db, wikiReviewQueue } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import { z } from "zod";

type ReviewKind = "contradiction" | "citation_validation" | "lint" | "integrity_violation" | "ingest_failure";
const statuses = ["pending", "in_review", "resolved", "dismissed"] as const;

const listInputSchema = z.object({
  status: z.enum(statuses).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

const resolveInputSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(statuses),
});

export async function listWikiReviews(context: { workspaceId: string }, raw: unknown) {
  const input = listInputSchema.parse(raw);
  const where = and(eq(wikiReviewQueue.workspaceId, context.workspaceId), input.status ? eq(wikiReviewQueue.status, input.status) : undefined);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: wikiReviewQueue.id,
        kind: wikiReviewQueue.kind,
        status: wikiReviewQueue.status,
        description: wikiReviewQueue.description,
        sourceRevisionId: wikiReviewQueue.sourceRevisionId,
        affectedPages: wikiReviewQueue.affectedPages,
        createdAt: wikiReviewQueue.createdAt,
        updatedAt: wikiReviewQueue.reviewedAt,
      })
      .from(wikiReviewQueue)
      .where(where)
      .orderBy(desc(wikiReviewQueue.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(wikiReviewQueue).where(where),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      kind: row.kind as ReviewKind,
      status: row.status,
      affectedPages: row.affectedPages ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
    })),
    total: Number(totals[0]?.total ?? 0),
  };
}

export async function resolveWikiReview(context: { workspaceId: string; actorUserId: string }, raw: unknown) {
  const input = resolveInputSchema.parse(raw);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(wikiReviewQueue)
      .set({
        status: input.status,
        reviewedAt: new Date(),
        reviewedByUserId: context.actorUserId,
      })
      .where(and(eq(wikiReviewQueue.workspaceId, context.workspaceId), eq(wikiReviewQueue.id, input.reviewId)))
      .returning({
        id: wikiReviewQueue.id,
        status: wikiReviewQueue.status,
      });

    if (!row) throw new Error("WIKI_REVIEW_NOT_FOUND");

    await tx.insert(auditLog).values(
      buildAuditRow({
        workspaceId: context.workspaceId,
        userId: context.actorUserId,
        action: "admin.wiki-review.update",
        resourceType: "wiki_review_queue",
        resourceId: row.id,
        details: { status: input.status },
      }),
    );

    return row;
  });

  return { ok: true as const, reviewId: updated.id, status: updated.status };
}
