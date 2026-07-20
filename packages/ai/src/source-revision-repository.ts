import { and, eq } from "drizzle-orm";
import type { SourceRevisionReadRepository } from "./types.js";

export function createSourceRevisionReadRepository(
  database: typeof import("@jarvis/db").db,
): SourceRevisionReadRepository {
  return {
    async findReadableRevision(input) {
      const { sourceDocument, sourceRevision } = await import("@jarvis/db/schema");
      const [row] = await database
        .select({
          id: sourceRevision.id,
          workspaceId: sourceRevision.workspaceId,
          sourceDocumentId: sourceRevision.sourceDocumentId,
          title: sourceDocument.title,
          canonicalUrl: sourceDocument.canonicalUrl,
          effectiveFrom: sourceRevision.effectiveFrom,
          normalizedObjectKey: sourceRevision.normalizedObjectKey,
        })
        .from(sourceRevision)
        .innerJoin(sourceDocument, and(
          eq(sourceDocument.id, sourceRevision.sourceDocumentId),
          eq(sourceDocument.workspaceId, sourceRevision.workspaceId),
        ))
        .where(and(
          eq(sourceRevision.workspaceId, input.workspaceId),
          eq(sourceRevision.id, input.sourceRevisionId),
        ))
        .limit(1);

      return row
        ? {
            ...row,
            effectiveFrom: row.effectiveFrom instanceof Date
              ? row.effectiveFrom.toISOString()
              : row.effectiveFrom,
          }
        : null;
    },
  };
}
