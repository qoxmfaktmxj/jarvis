import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { reviewQueue } from '@jarvis/db/schema/review-queue';
import { eq } from 'drizzle-orm';
import * as mammoth from 'mammoth';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { parsePdf } from '../lib/pdf-parser.js';
import {
  computeSensitivity,
  detectSecretKeywords,
  redactPII,
  type Sensitivity,
} from '../lib/pii-redactor.js';

export interface IngestJobData {
  rawSourceId: string;
}

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

    // ---- Step 0: PII / SECRET guard ----
    const currentSensitivity =
      (source.sensitivity as Sensitivity | null) ?? 'INTERNAL';
    const secretHits = detectSecretKeywords(extractedText);
    const newSensitivity = computeSensitivity(extractedText, currentSensitivity);

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
    if (newSensitivity !== currentSensitivity) {
      await db
        .update(rawSource)
        .set({ sensitivity: newSensitivity, updatedAt: new Date() })
        .where(eq(rawSource.id, rawSourceId));
    }

    // extractedText는 이후 단계용으로 redacted 버전으로 교체
    const { redacted } = redactPII(extractedText);
    const safeText = redacted;
    // ---- End Step 0 ----

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
