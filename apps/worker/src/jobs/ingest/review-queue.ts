import { and, eq, sql } from "drizzle-orm";
import { db, wikiReviewQueue } from "@jarvis/db";
import { type LockedDbExecutor, withWorkspaceSingleWriter } from "../../lib/single-writer.js";

export const REVIEW_KINDS = [
  "contradiction",
  "citation_validation",
  "lint",
  "ingest_failure",
  "integrity_violation",
] as const;

export type ReviewKind = (typeof REVIEW_KINDS)[number];

export async function enqueueReview(input: {
  workspaceId: string;
  kind: ReviewKind;
  sourceRevisionId?: string | null;
  affectedPages?: string[];
  commitSha?: string | null;
  description: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await withWorkspaceSingleWriter(input.workspaceId, async (tx) => enqueueReviewInTx(input, tx));
}

export async function enqueueReviewInTx(input: {
  workspaceId: string;
  kind: ReviewKind;
  sourceRevisionId?: string | null;
  affectedPages?: string[];
  commitSha?: string | null;
  description: string;
  payload?: Record<string, unknown>;
}, tx: LockedDbExecutor): Promise<void> {
  const sourceRevisionId = input.sourceRevisionId ?? null;
  const commitSha = input.commitSha ?? null;
  const description = input.description.slice(0, 2_000);

  const [existing] = await tx
    .select({ id: wikiReviewQueue.id })
    .from(wikiReviewQueue)
    .where(
      and(
        eq(wikiReviewQueue.workspaceId, input.workspaceId),
        eq(wikiReviewQueue.kind, input.kind),
        eq(wikiReviewQueue.description, description),
        sql`coalesce(${wikiReviewQueue.sourceRevisionId}::text, '') = coalesce(${sourceRevisionId}, '')`,
        sql`coalesce(${wikiReviewQueue.commitSha}, '') = coalesce(${commitSha}, '')`,
      ),
    )
    .limit(1);
  if (existing) return;

  await tx.insert(wikiReviewQueue).values({
    workspaceId: input.workspaceId,
    kind: input.kind,
    sourceRevisionId,
    affectedPages: input.affectedPages ?? [],
    commitSha,
    description,
    payload: input.payload ?? {},
    status: "pending",
  });
}

export function serializeError(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message.slice(0, 2_000) }
    : { name: "UnknownError", message: String(error).slice(0, 2_000) };
}
