import crypto from 'node:crypto';
import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { reviewQueue } from '@jarvis/db/schema/review-queue';
import { knowledgePage, knowledgeClaim } from '@jarvis/db/schema/knowledge';
import { featureTwoStepIngest, featureDocumentChunksWrite } from '@jarvis/db/feature-flags';
import { upsertChunks } from '@jarvis/db/writers/document-chunks';
import { eq, sql } from 'drizzle-orm';
import * as mammoth from 'mammoth';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { parsePdf } from '../lib/pdf-parser.js';
import {
  detectSecretKeywords,
  redactPII,
  type Sensitivity,
} from '../lib/pii-redactor.js';
import { chunkText } from '../lib/text-chunker.js';
import { generateEmbedding } from '@jarvis/ai/embed';
import OpenAI from 'openai';

export interface IngestJobData {
  rawSourceId: string;
}

const INGEST_MODEL = process.env['INGEST_AI_MODEL'] ?? 'gpt-5.4-mini';
const ingestOpenAI = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

async function downloadFromMinio(storagePath: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, storagePath);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    return parsePdf(buffer);
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return buffer.toString('utf-8');
  }

  // Archive formats: return a structured placeholder for downstream processing.
  const ARCHIVE_MIME_TYPES = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-gzip',
    'application/x-bzip2',
    'application/x-7z-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
  ]);
  if (ARCHIVE_MIME_TYPES.has(mimeType)) {
    return `[Archive: ${mimeType}] This file is a compressed archive that requires extraction for content analysis.`;
  }

  // Other binary types (images, videos, etc.) — not text-extractable
  return `[Binary: ${mimeType}]`;
}

/**
 * Two-step ingest pipeline (Phase-7B).
 *
 * Step 1: Chunk safeText → SHA-256 hash + embedding per chunk → upsert document_chunks
 *         (only when FEATURE_DOCUMENT_CHUNKS_WRITE=true)
 * Step 2: LLM synthesis → upsert knowledge_page (draft, generated) + knowledge_claims
 *         (non-fatal: LLM errors are caught and logged)
 *
 * Exported for testability.
 */
export async function twoStepIngest(
  rawSourceId: string,
  workspaceId: string,
  safeText: string,
  sensitivity: string,
): Promise<void> {
  // ---- Step 1: chunk + embed → document_chunks ----
  const rawChunks = chunkText(safeText, 300, 50);
  if (rawChunks.length === 0) return;

  // Only write chunks if both flags are on
  if (featureDocumentChunksWrite()) {
    const chunksToWrite = await Promise.all(
      rawChunks.map(async (content, idx) => {
        const contentHash = crypto.createHash('sha256').update(content).digest('hex');
        const embedding = await generateEmbedding(content);
        return {
          workspaceId,
          documentType: 'raw_source',
          documentId: rawSourceId,
          chunkIndex: idx,
          content,
          contentHash,
          embedding,
          tokens: Math.ceil(content.split(/\s+/).length * 1.3), // rough token estimate
          sensitivity: sensitivity as 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'SECRET_REF_ONLY',
        };
      }),
    );
    await upsertChunks(chunksToWrite);
  }

  // ---- Step 2: LLM synthesis → knowledge_page (draft, generated) ----
  const truncated = safeText.slice(0, 12000); // ~3k tokens context budget
  const systemPrompt = `You are a knowledge extraction assistant. Given a document, produce a JSON object with:
- "title": concise page title (max 100 chars)
- "summary": 2-3 sentence summary of the document
- "claims": array of 3–5 key factual claims (each max 200 chars), as plain strings

Respond ONLY with valid JSON. No markdown fences. No extra text.`;

  const userPrompt = `Document (workspaceId=${workspaceId}, rawSourceId=${rawSourceId}):\n\n${truncated}`;

  let synthesis: { title: string; summary: string; claims: string[] };
  try {
    const resp = await ingestOpenAI.chat.completions.create({
      model: INGEST_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    synthesis = JSON.parse(resp.choices[0]?.message?.content ?? '{}');
  } catch (err) {
    console.warn(`[ingest] LLM synthesis failed for rawSourceId=${rawSourceId}: ${String(err)}`);
    return; // non-fatal: chunks are already written
  }

  if (!synthesis.title || !synthesis.summary) return;

  const slug = `generated-${rawSourceId}`;

  // Upsert knowledge_page (draft, generated authority)
  const [page] = await db
    .insert(knowledgePage)
    .values({
      workspaceId,
      pageType: 'generated',
      title: synthesis.title.slice(0, 500),
      slug,
      summary: synthesis.summary,
      sensitivity: sensitivity,
      publishStatus: 'draft',
      authority: 'generated',
      sourceOrigin: 'ingest-two-step',
      sourceType: 'raw_source',
      sourceKey: rawSourceId,
    })
    .onConflictDoUpdate({
      target: [knowledgePage.workspaceId, knowledgePage.sourceType, knowledgePage.sourceKey],
      set: {
        title: synthesis.title.slice(0, 500),
        summary: synthesis.summary,
        updatedAt: new Date(),
      },
    })
    .returning({ id: knowledgePage.id });

  if (!page) return;

  // Delete old generated claims (idempotent re-run)
  await db.delete(knowledgeClaim).where(
    sql`page_id = ${page.id}::uuid AND claim_source = 'generated'`,
  );

  const claims = (synthesis.claims ?? []).slice(0, 5);
  if (claims.length > 0) {
    await Promise.all(
      claims.map(async (claimText, idx) => {
        const embedding = await generateEmbedding(claimText);
        await db.insert(knowledgeClaim).values({
          pageId: page.id,
          claimText: claimText.slice(0, 1000),
          embedding,
          claimSource: 'generated',
          sortOrder: idx,
        });
      }),
    );
  }
}

export async function ingestHandler(
  jobs: PgBoss.Job<IngestJobData>[],
): Promise<void> {
  for (const job of jobs) {
    await processIngest(job);
  }
}

async function processIngest(
  job: PgBoss.Job<IngestJobData>,
): Promise<void> {
  const { rawSourceId } = job.data;
  console.log(`[ingest] Starting job for rawSourceId=${rawSourceId}`);

  // Mark as processing
  await db
    .update(rawSource)
    .set({ ingestStatus: 'processing', updatedAt: new Date() })
    .where(eq(rawSource.id, rawSourceId));

  try {
    // Fetch raw_source record
    const [source] = await db
      .select()
      .from(rawSource)
      .where(eq(rawSource.id, rawSourceId))
      .limit(1);

    if (!source) {
      throw new Error(`raw_source not found: ${rawSourceId}`);
    }

    if (!source.storagePath) {
      throw new Error(`raw_source has no storagePath: ${rawSourceId}`);
    }

    // Download file from MinIO
    const buffer = await downloadFromMinio(source.storagePath);

    // Extract text
    const mimeType = source.mimeType ?? 'application/octet-stream';
    const extractedText = await extractText(buffer, mimeType);

    // ---- Step 0: PII / SECRET guard (single-pass) ----
    // Run each scan exactly once to avoid redundant regex sweeps.
    // computeSensitivity() is intentionally NOT called here because it would
    // re-invoke detectSecretKeywords + redactPII internally.
    const currentSensitivity =
      (source.sensitivity as Sensitivity | null) ?? 'INTERNAL';
    const secretHits = detectSecretKeywords(extractedText);
    const { redacted, hits: piiHits } = redactPII(extractedText);

    if (secretHits.length > 0) {
      await db.insert(reviewQueue).values({
        workspaceId: source.workspaceId,
        documentId: source.id,
        documentType: 'raw_source',
        reason: 'SECRET_KEYWORD',
        matchedKeywords: secretHits,
        status: 'pending',
      });
      await db
        .update(rawSource)
        .set({
          ingestStatus: 'queued_for_review',
          sensitivity: 'SECRET_REF_ONLY',
          updatedAt: new Date(),
        })
        .where(eq(rawSource.id, rawSourceId));
      console.log(
        `[ingest] SECRET hit rawSourceId=${rawSourceId} keywords=${secretHits.join(',')}`,
      );
      return;
    }

    // PII만 있음 → sensitivity만 승급하고 계속 진행
    const hasPII = piiHits.length > 0;
    const ORDER: Record<Sensitivity, number> = {
      PUBLIC: 0,
      INTERNAL: 1,
      RESTRICTED: 2,
      SECRET_REF_ONLY: 3,
    };
    const newSensitivity: Sensitivity = hasPII
      ? (ORDER[currentSensitivity] >= ORDER.INTERNAL
          ? currentSensitivity
          : 'INTERNAL')
      : currentSensitivity;

    if (newSensitivity !== currentSensitivity) {
      await db
        .update(rawSource)
        .set({ sensitivity: newSensitivity, updatedAt: new Date() })
        .where(eq(rawSource.id, rawSourceId));
    }

    // extractedText는 이후 단계용으로 redacted 버전으로 교체
    const safeText = redacted;
    // ---- End Step 0 ----

    // ---- Step 1+2: Two-step ingest (feature flagged) ----
    if (featureTwoStepIngest()) {
      try {
        await twoStepIngest(rawSourceId, source.workspaceId, safeText, newSensitivity);
      } catch (err) {
        // non-fatal: log and continue
        console.warn(`[ingest] twoStepIngest failed rawSourceId=${rawSourceId}: ${String(err)}`);
      }
    }
    // ---- End two-step ingest ----

    // Update raw_source with parsed content (redacted)
    await db
      .update(rawSource)
      .set({
        parsedContent: safeText,
        ingestStatus: 'done',
        updatedAt: new Date(),
      })
      .where(eq(rawSource.id, rawSourceId));

    console.log(
      `[ingest] Done rawSourceId=${rawSourceId} chars=${safeText.length}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] Error rawSourceId=${rawSourceId}: ${message}`);
    await db
      .update(rawSource)
      .set({
        ingestStatus: 'error',
        metadata: { error: message },
        updatedAt: new Date(),
      })
      .where(eq(rawSource.id, rawSourceId));
    throw err; // re-throw so pg-boss marks the job as failed and retries
  }
}
