import PgBoss from "pg-boss";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { auditLog, db, sourceDocument, sourceRevision, wikiPageIndex, wikiPageSourceRef } from "@jarvis/db";
import { createMinioObjectStoreFromEnv } from "@jarvis/storage";
import { buildAuditRow } from "@jarvis/shared/audit";
import { SOURCE_INGEST_QUEUE, sourceIngestPayloadSchema } from "@jarvis/shared/queues/wiki";
import { z } from "zod";

const listInputSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

const queueInputSchema = z.object({
  providerId: z.string().trim().min(1).max(80),
  externalId: z.string().trim().min(1).max(180),
  retrievedAt: z.string().datetime().optional(),
});

const previewInputSchema = z.object({
  id: z.string().uuid(),
});

export type SourcePreview = {
  title: string;
  canonicalUrl: string;
  sourceType: "law" | "case" | "interpretation" | "guide";
  revisionKey: string;
  effectiveFrom: string | null;
  retrievedAt: string;
  content: string;
  truncated: boolean;
  wikiPages: Array<{ title: string; path: string }>;
};

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

async function appendAudit(row: Parameters<typeof buildAuditRow>[0]) {
  await db.insert(auditLog).values(buildAuditRow(row));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listSources(context: { workspaceId: string }, raw: unknown) {
  const input = listInputSchema.parse(raw);
  const outerDocumentId = sql.raw('"source_document"."id"');
  const where = and(
    eq(sourceDocument.workspaceId, context.workspaceId),
    input.q
      ? or(
          ilike(sourceDocument.provider, `%${escapeLike(input.q)}%`),
          ilike(sourceDocument.externalId, `%${escapeLike(input.q)}%`),
          ilike(sourceDocument.title, `%${escapeLike(input.q)}%`),
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: sourceDocument.id,
      provider: sourceDocument.provider,
      externalId: sourceDocument.externalId,
      title: sourceDocument.title,
      sourceType: sourceDocument.sourceType,
      latestRevisionId: sql<string | null>`(
        select sr.id::text from source_revision sr
        where sr.workspace_id = ${context.workspaceId}::uuid and sr.source_document_id = ${outerDocumentId}
        order by sr.retrieved_at desc, sr.id desc
        limit 1
      )`,
      parseStatus: sql<string | null>`(
        select sr.parse_status::text from source_revision sr
        where sr.workspace_id = ${context.workspaceId}::uuid and sr.source_document_id = ${outerDocumentId}
        order by sr.retrieved_at desc, sr.id desc
        limit 1
      )`,
      retrievedAt: sql<Date>`coalesce((
        select sr.retrieved_at from source_revision sr
        where sr.workspace_id = ${context.workspaceId}::uuid and sr.source_document_id = ${outerDocumentId}
        order by sr.retrieved_at desc, sr.id desc
        limit 1
      ), ${sourceDocument.updatedAt})`.mapWith(sourceDocument.updatedAt),
      stalePageCount: sql<number>`(
        select count(distinct page.id)::int
        from wiki_page_source_ref ref
        inner join source_revision sr on sr.id = ref.source_revision_id
        inner join wiki_page_index page on page.id = ref.page_id
        where ref.workspace_id = ${context.workspaceId}::uuid
          and sr.workspace_id = ${context.workspaceId}::uuid
          and sr.source_document_id = ${outerDocumentId}
          and page.workspace_id = ${context.workspaceId}::uuid
          and page.stale = true
      )`,
      linkedWikiPageCount: sql<number>`(
        select count(distinct ref.page_id)::int
        from wiki_page_source_ref ref
        inner join source_revision sr on sr.id = ref.source_revision_id
        inner join wiki_page_index page on page.id = ref.page_id
        where ref.workspace_id = ${context.workspaceId}::uuid
          and sr.workspace_id = ${context.workspaceId}::uuid
          and sr.source_document_id = ${outerDocumentId}
          and page.workspace_id = ${context.workspaceId}::uuid
          and page.published_status = 'published'
      )`,
    })
    .from(sourceDocument)
    .where(where)
    .orderBy(asc(sourceDocument.title))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);

  const totals = await db.select({ total: count() }).from(sourceDocument).where(where);

  return {
    rows: rows.map((row) => ({
      ...row,
      latestRevisionId: row.latestRevisionId,
      parseStatus: (row.parseStatus ?? "pending") as "pending" | "parsed" | "failed",
      retrievedAt: row.retrievedAt.toISOString(),
      stalePageCount: Number(row.stalePageCount ?? 0),
      linkedWikiPageCount: Number(row.linkedWikiPageCount ?? 0),
    })),
    total: Number(totals[0]?.total ?? 0),
  };
}

export async function getSourcePreview(context: { workspaceId: string }, raw: unknown): Promise<SourcePreview | null> {
  const input = previewInputSchema.parse(raw);
  const [revision] = await db
    .select({
      title: sourceDocument.title,
      canonicalUrl: sourceDocument.canonicalUrl,
      sourceType: sourceDocument.sourceType,
      revisionKey: sourceRevision.revisionKey,
      effectiveFrom: sourceRevision.effectiveFrom,
      retrievedAt: sourceRevision.retrievedAt,
      normalizedObjectKey: sourceRevision.normalizedObjectKey,
      id: sourceRevision.id,
    })
    .from(sourceRevision)
    .innerJoin(sourceDocument, eq(sourceDocument.id, sourceRevision.sourceDocumentId))
    .where(and(
      eq(sourceDocument.workspaceId, context.workspaceId),
      eq(sourceDocument.id, input.id),
      eq(sourceRevision.workspaceId, context.workspaceId),
    ))
    .orderBy(desc(sourceRevision.retrievedAt), desc(sourceRevision.id))
    .limit(1);

  if (!revision) return null;

  const wikiPages = await db
    .selectDistinct({ title: wikiPageIndex.title, path: wikiPageIndex.path })
    .from(wikiPageSourceRef)
    .innerJoin(wikiPageIndex, eq(wikiPageIndex.id, wikiPageSourceRef.pageId))
    .where(and(
      eq(wikiPageSourceRef.workspaceId, context.workspaceId),
      eq(wikiPageSourceRef.sourceRevisionId, revision.id),
      eq(wikiPageIndex.workspaceId, context.workspaceId),
      eq(wikiPageIndex.publishedStatus, "published"),
    ))
    .orderBy(asc(wikiPageIndex.title));

  const content = await createMinioObjectStoreFromEnv(process.env).getText(revision.normalizedObjectKey);
  const maxLength = 12_000;

  return {
    title: revision.title,
    canonicalUrl: revision.canonicalUrl,
    sourceType: revision.sourceType,
    revisionKey: revision.revisionKey,
    effectiveFrom: revision.effectiveFrom?.toISOString() ?? null,
    retrievedAt: revision.retrievedAt.toISOString(),
    content: content.slice(0, maxLength),
    truncated: content.length > maxLength,
    wikiPages,
  };
}

export async function queueSourceIngest(context: { workspaceId: string; actorUserId: string }, raw: unknown) {
  const input = queueInputSchema.parse(raw);
  const payload = sourceIngestPayloadSchema.parse({
    workspaceId: context.workspaceId,
    providerId: input.providerId,
    externalId: input.externalId,
    retrievedAt: input.retrievedAt,
  });

  const boss = new PgBoss({ connectionString: requireDatabaseUrl() });
  let jobId: string;
  await boss.start();
  try {
    await boss.createQueue(SOURCE_INGEST_QUEUE);
    const sent = await boss.send(SOURCE_INGEST_QUEUE, payload);
    if (!sent) throw new Error("SOURCE_INGEST_ENQUEUE_FAILED");
    jobId = sent;
  } finally {
    await boss.stop();
  }

  await appendAudit({
    workspaceId: context.workspaceId,
    userId: context.actorUserId,
    action: "admin.source.queue_ingest",
    resourceType: "source_ingest_job",
    resourceId: jobId,
    details: { providerId: input.providerId, externalId: input.externalId },
  });

  return {
    ok: true as const,
    jobId,
  };
}
