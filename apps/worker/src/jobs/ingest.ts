import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { eq } from 'drizzle-orm';
import * as mammoth from 'mammoth';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { parsePdf } from '../lib/pdf-parser.js';

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

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/zip'
  ) {
    return buffer.toString('utf-8');
  }

  // Images and unsupported types: return placeholder
  return `[Binary file: ${mimeType}]`;
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

    // Update raw_source with parsed content
    await db
      .update(rawSource)
      .set({
        parsedContent: extractedText,
        ingestStatus: 'done',
        updatedAt: new Date(),
      })
      .where(eq(rawSource.id, rawSourceId));

    console.log(
      `[ingest] Done rawSourceId=${rawSourceId} chars=${extractedText.length}`,
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
