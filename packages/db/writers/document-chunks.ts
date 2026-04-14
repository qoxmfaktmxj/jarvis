// packages/db/writers/document-chunks.ts
import { db } from '../client.js';
import { documentChunks } from '../schema/document-chunks.js';
import { featureDocumentChunksWrite } from '../feature-flags.js';
import type { NewDocumentChunk } from '../schema/document-chunks.js';
import { sql } from 'drizzle-orm';

/**
 * Upsert chunks into document_chunks.
 * Conflict target: (document_type, document_id, chunk_index) — unique constraint.
 * On conflict: update content, content_hash, embedding, tokens, sensitivity, updated_at.
 *
 * Gated by FEATURE_DOCUMENT_CHUNKS_WRITE.
 */
export async function upsertChunks(chunks: NewDocumentChunk[]): Promise<void> {
  if (!featureDocumentChunksWrite()) {
    throw new Error(
      'document_chunks write path is disabled (FEATURE_DOCUMENT_CHUNKS_WRITE=false).',
    );
  }
  if (chunks.length === 0) return;

  await db
    .insert(documentChunks)
    .values(chunks)
    .onConflictDoUpdate({
      target: [
        documentChunks.documentType,
        documentChunks.documentId,
        documentChunks.chunkIndex,
      ],
      set: {
        content: sql`excluded.content`,
        contentHash: sql`excluded.content_hash`,
        embedding: sql`excluded.embedding`,
        tokens: sql`excluded.tokens`,
        sensitivity: sql`excluded.sensitivity`,
        updatedAt: sql`now()`,
      },
    });
}
