import { and, eq, inArray, ne } from "drizzle-orm";
import type PgBoss from "pg-boss";
import { buildAuditRow } from "@jarvis/shared/audit";
import { wikiIngestPayloadSchema, wikiIngestQueueName } from "@jarvis/shared/queues/wiki";
import {
  buildSourceObjectKey,
  createMinioObjectStoreFromEnv,
  normalizeSourceText,
  sha256,
  validateUpload,
  type ImmutableObjectStore,
  type PutObjectInput,
} from "@jarvis/storage";
import { getProvider, type ProviderAdapter, type ProviderPayload, type SourceType } from "../providers/index.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface IngestSourceRevisionInput {
  workspaceId: string;
  providerId: string;
  externalId: string;
  retrievedAt?: Date;
}

export interface IngestSourceRevisionResult {
  sourceDocumentId: string;
  sourceRevisionId: string;
  created: boolean;
  stalePageCount: number;
  rawObjectCreated: boolean;
  normalizedObjectCreated: boolean;
}

interface UpsertDocumentInput {
  workspaceId: string;
  provider: string;
  sourceType: SourceType;
  externalId: string;
  title: string;
  canonicalUrl: string;
  metadata: Record<string, unknown>;
  now: Date;
}

interface CommitRevisionInput {
  workspaceId: string;
  sourceDocumentId: string;
  provider: string;
  externalId: string;
  revisionKey: string;
  publishedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  retrievedAt: Date;
  checksumSha256: string;
  rawObjectKey: string;
  normalizedObjectKey: string;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
}

export interface SourceIngestRepository {
  upsertDocument(input: UpsertDocumentInput): Promise<{ id: string }>;
  findRevisionByChecksum(input: {
    workspaceId: string;
    sourceDocumentId: string;
    checksumSha256: string;
  }): Promise<{ id: string } | null>;
  findRevisionByKey(input: {
    workspaceId: string;
    sourceDocumentId: string;
    revisionKey: string;
  }): Promise<{ id: string; checksumSha256: string } | null>;
  commitRevision(input: CommitRevisionInput): Promise<{
    id: string;
    created: boolean;
    stalePageCount: number;
  }>;
}

export const drizzleSourceIngestRepository: SourceIngestRepository = {
  async upsertDocument(input) {
    const { db, sourceDocument } = await import("@jarvis/db");
    const [row] = await db.insert(sourceDocument).values({
      workspaceId: input.workspaceId,
      provider: input.provider,
      sourceType: input.sourceType,
      externalId: input.externalId,
      title: input.title,
      canonicalUrl: input.canonicalUrl,
      metadata: input.metadata,
      createdAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: [sourceDocument.workspaceId, sourceDocument.provider, sourceDocument.externalId],
      set: {
        sourceType: input.sourceType,
        title: input.title,
        canonicalUrl: input.canonicalUrl,
        metadata: input.metadata,
        updatedAt: input.now,
      },
    }).returning({ id: sourceDocument.id });
    if (!row) throw new Error("source document upsert returned no row");
    return row;
  },

  async findRevisionByChecksum(input) {
    const { db, sourceRevision } = await import("@jarvis/db");
    const [row] = await db.select({ id: sourceRevision.id }).from(sourceRevision).where(and(
      eq(sourceRevision.workspaceId, input.workspaceId),
      eq(sourceRevision.sourceDocumentId, input.sourceDocumentId),
      eq(sourceRevision.checksumSha256, input.checksumSha256),
    )).limit(1);
    return row ?? null;
  },

  async findRevisionByKey(input) {
    const { db, sourceRevision } = await import("@jarvis/db");
    const [row] = await db.select({
      id: sourceRevision.id,
      checksumSha256: sourceRevision.checksumSha256,
    }).from(sourceRevision).where(and(
      eq(sourceRevision.workspaceId, input.workspaceId),
      eq(sourceRevision.sourceDocumentId, input.sourceDocumentId),
      eq(sourceRevision.revisionKey, input.revisionKey),
    )).limit(1);
    return row ?? null;
  },

  async commitRevision(input) {
    const { auditLog, db, sourceRevision, wikiPageIndex, wikiPageSourceRef } = await import("@jarvis/db");
    return db.transaction(async (tx) => {
      const [inserted] = await tx.insert(sourceRevision).values({
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        revisionKey: input.revisionKey,
        publishedAt: input.publishedAt,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        retrievedAt: input.retrievedAt,
        checksumSha256: input.checksumSha256,
        rawObjectKey: input.rawObjectKey,
        normalizedObjectKey: input.normalizedObjectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        parseStatus: "parsed",
        metadata: input.metadata,
        createdAt: input.retrievedAt,
      }).onConflictDoNothing({
        target: [sourceRevision.sourceDocumentId, sourceRevision.checksumSha256],
      }).returning({ id: sourceRevision.id });

      if (!inserted) {
        const [existing] = await tx.select({ id: sourceRevision.id }).from(sourceRevision)
          .where(and(
            eq(sourceRevision.workspaceId, input.workspaceId),
            eq(sourceRevision.sourceDocumentId, input.sourceDocumentId),
            eq(sourceRevision.checksumSha256, input.checksumSha256),
          )).limit(1);
        if (!existing) throw new Error("source revision conflict without existing row");
        return { id: existing.id, created: false, stalePageCount: 0 };
      }

      const oldReferencedPageIds = tx.selectDistinct({ pageId: wikiPageSourceRef.pageId })
        .from(wikiPageSourceRef)
        .innerJoin(sourceRevision, and(
          eq(wikiPageSourceRef.sourceRevisionId, sourceRevision.id),
          eq(sourceRevision.workspaceId, input.workspaceId),
        ))
        .where(and(
          eq(wikiPageSourceRef.workspaceId, input.workspaceId),
          eq(sourceRevision.sourceDocumentId, input.sourceDocumentId),
          ne(sourceRevision.id, inserted.id),
        ));

      const staleRows = await tx.update(wikiPageIndex)
        .set({ stale: true, updatedAt: input.retrievedAt })
        .where(and(
          eq(wikiPageIndex.workspaceId, input.workspaceId),
          eq(wikiPageIndex.stale, false),
          inArray(wikiPageIndex.id, oldReferencedPageIds),
        ))
        .returning({ id: wikiPageIndex.id });

      await tx.insert(auditLog).values(buildAuditRow({
        workspaceId: input.workspaceId,
        userId: null,
        action: "source.revision.ingest",
        resourceType: "source_revision",
        resourceId: inserted.id,
        details: {
          provider: input.provider,
          externalId: input.externalId,
          stalePageCount: staleRows.length,
        },
      }));

      return { id: inserted.id, created: true, stalePageCount: staleRows.length };
    });
  },
};

function requireSafeText(field: string, value: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || CONTROL.test(normalized)) {
    throw new Error(`invalid ${field}`);
  }
  return normalized;
}

function validateCanonicalUrl(value: string, provider: ProviderAdapter): string {
  if (value.length > 500) throw new Error("canonical URL is too long");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      !provider.canonicalHostnames.has(url.hostname.toLowerCase())) {
    throw new Error("canonical URL denied");
  }
  return url.toString();
}

function validatePayload(provider: ProviderAdapter, externalId: string, payload: ProviderPayload): ProviderPayload {
  if (payload.document.provider !== provider.id) throw new Error("provider payload identity mismatch");
  if (payload.document.externalId !== externalId) throw new Error("provider external ID mismatch");
  requireSafeText("externalId", payload.document.externalId, 180);
  requireSafeText("title", payload.document.title, 300);
  requireSafeText("revisionKey", payload.revision.revisionKey, 180);
  validateCanonicalUrl(payload.document.canonicalUrl, provider);
  if (payload.revision.effectiveFrom && payload.revision.effectiveTo &&
      payload.revision.effectiveTo < payload.revision.effectiveFrom) {
    throw new Error("effectiveTo precedes effectiveFrom");
  }
  return payload;
}

export async function ingestSourceRevision(
  input: IngestSourceRevisionInput,
  deps: {
    objectStore: ImmutableObjectStore;
    repository?: SourceIngestRepository;
    resolveProvider?: (providerId: string) => ProviderAdapter;
  },
): Promise<IngestSourceRevisionResult> {
  if (!UUID.test(input.workspaceId)) throw new Error("invalid workspaceId");
  const providerId = requireSafeText("providerId", input.providerId, 80);
  const externalId = requireSafeText("externalId", input.externalId, 180);
  const retrievedAt = input.retrievedAt ?? new Date();
  if (!Number.isFinite(retrievedAt.getTime())) throw new Error("invalid retrievedAt");

  const provider = (deps.resolveProvider ?? getProvider)(providerId);
  const repository = deps.repository ?? drizzleSourceIngestRepository;
  const payload = validatePayload(provider, externalId, await provider.fetch(externalId));
  const upload = validateUpload(payload.revision.rawBytes, payload.revision.contentType);
  const normalizedBytes = new TextEncoder().encode(normalizeSourceText(payload.revision.normalizedText));
  const rawChecksum = sha256(payload.revision.rawBytes);
  const normalizedChecksum = sha256(normalizedBytes);

  const document = await repository.upsertDocument({
    workspaceId: input.workspaceId,
    provider: provider.id,
    sourceType: payload.document.sourceType,
    externalId,
    title: requireSafeText("title", payload.document.title, 300),
    canonicalUrl: validateCanonicalUrl(payload.document.canonicalUrl, provider),
    metadata: payload.document.metadata,
    now: retrievedAt,
  });

  const duplicate = await repository.findRevisionByChecksum({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    checksumSha256: rawChecksum,
  });
  if (duplicate) {
    return {
      sourceDocumentId: document.id,
      sourceRevisionId: duplicate.id,
      created: false,
      stalePageCount: 0,
      rawObjectCreated: false,
      normalizedObjectCreated: false,
    };
  }

  const revisionKey = requireSafeText("revisionKey", payload.revision.revisionKey, 180);
  const sameRevisionKey = await repository.findRevisionByKey({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    revisionKey,
  });
  if (sameRevisionKey && sameRevisionKey.checksumSha256 !== rawChecksum) {
    throw new Error("revision key already exists with different content");
  }

  const rawObjectKey = buildSourceObjectKey({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    checksum: rawChecksum,
    variant: "raw",
    extension: upload.extension,
  });
  const normalizedObjectKey = buildSourceObjectKey({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    checksum: normalizedChecksum,
    variant: "normalized",
    extension: "txt",
  });
  const rawPut = await deps.objectStore.putIfAbsent({
    key: rawObjectKey,
    body: payload.revision.rawBytes,
    contentType: upload.contentType,
    checksum: rawChecksum,
  });
  const normalizedPut = await deps.objectStore.putIfAbsent({
    key: normalizedObjectKey,
    body: normalizedBytes,
    contentType: "text/plain",
    checksum: normalizedChecksum,
  });

  const committed = await repository.commitRevision({
    workspaceId: input.workspaceId,
    sourceDocumentId: document.id,
    provider: provider.id,
    externalId,
    revisionKey,
    publishedAt: payload.revision.publishedAt,
    effectiveFrom: payload.revision.effectiveFrom,
    effectiveTo: payload.revision.effectiveTo,
    retrievedAt,
    checksumSha256: rawChecksum,
    rawObjectKey,
    normalizedObjectKey,
    mimeType: upload.contentType,
    sizeBytes: upload.sizeBytes,
    metadata: payload.revision.metadata,
  });

  return {
    sourceDocumentId: document.id,
    sourceRevisionId: committed.id,
    created: committed.created,
    stalePageCount: committed.stalePageCount,
    rawObjectCreated: rawPut.created,
    normalizedObjectCreated: normalizedPut.created,
  };
}

export function createSourceIngestService(
  env: Record<string, string | undefined> = process.env,
): (input: IngestSourceRevisionInput) => Promise<IngestSourceRevisionResult> {
  const objectStore = createMinioObjectStoreFromEnv(env);
  return (input) => ingestSourceRevision(input, { objectStore });
}

export async function handleSourceIngestJob(
  input: IngestSourceRevisionInput,
  deps: {
    boss: Pick<PgBoss, "send">;
    service?: (input: IngestSourceRevisionInput) => Promise<IngestSourceRevisionResult>;
  },
): Promise<IngestSourceRevisionResult> {
  const service = deps.service ?? createSourceIngestService();
  const result = await service(input);
  if (result.created) {
    const payload = wikiIngestPayloadSchema.parse({
      workspaceId: input.workspaceId,
      sourceRevisionId: result.sourceRevisionId,
    });
    await deps.boss.send(wikiIngestQueueName(input.workspaceId), payload);
  }
  return result;
}

export type { ImmutableObjectStore, PutObjectInput };
