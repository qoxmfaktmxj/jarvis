import crypto from 'node:crypto';
import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { reviewQueue } from '@jarvis/db/schema/review-queue';
import { knowledgePage, knowledgeClaim } from '@jarvis/db/schema/knowledge';
import {
  featureTwoStepIngest,
  featureDocumentChunksWrite,
  featureWikiFsMode,
} from '@jarvis/db/feature-flags';
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
import { analyze } from './ingest/analyze.js';
import { generate } from './ingest/generate.js';
import { writeAndCommit } from './ingest/write-and-commit.js';
import { recordReviewQueue } from './ingest/review-queue.js';
import type { WikiSensitivity } from '@jarvis/wiki-fs';

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
 * Legacy two-step ingest pipeline (Phase-7B).
 *
 * Step 1: Chunk safeText → SHA-256 hash + embedding per chunk → upsert document_chunks
 *         (only when FEATURE_DOCUMENT_CHUNKS_WRITE=true)
 * Step 2: LLM synthesis → upsert knowledge_page (draft, generated) + knowledge_claims
 *         (non-fatal: LLM errors are caught and logged)
 *
 * Renamed from `twoStepIngest` in W2-T1: the new wiki-fs path is
 * `wikiTwoStepIngest` below. The legacy alias `twoStepIngest` remains
 * exported for backward compatibility with existing integration tests.
 *
 * Exported for testability.
 */
export async function legacyTwoStepIngest(
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
    const chunksToWrite: Array<{
      workspaceId: string; documentType: string; documentId: string;
      chunkIndex: number; content: string; contentHash: string;
      embedding: number[]; tokens: number; sensitivity: string;
    }> = [];
    // Sequential embedding to stay within OpenAI rate limits
    for (let idx = 0; idx < rawChunks.length; idx++) {
      const content = rawChunks[idx]!;
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      const embedding = await generateEmbedding(content);
      chunksToWrite.push({
        workspaceId,
        documentType: 'raw_source',
        documentId: rawSourceId,
        chunkIndex: idx,
        content,
        contentHash,
        embedding,
        tokens: Math.ceil(content.split(/\s+/).length * 1.3),
        sensitivity,
      });
    }
    await upsertChunks(chunksToWrite);
  }

  // ---- Step 2: LLM synthesis → knowledge_page (draft, generated) ----
  const truncated = safeText.slice(0, 12000); // ~3k tokens context budget
  const systemPrompt = `You are a knowledge extraction assistant. Given a document, produce a JSON object with:
- "title": concise page title (max 100 chars)
- "summary": 2-3 sentence summary of the document
- "claims": array of 3–5 key factual claims (each max 200 chars), as plain strings

Respond ONLY with valid JSON. No markdown fences. No extra text.`;

  const userPrompt = `Document:\n\n${truncated}`;

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
  // Sequential to avoid rate-limit bursts; each claim is short so latency is low
  for (let idx = 0; idx < claims.length; idx++) {
    const claimText = claims[idx]!;
    try {
      const embedding = await generateEmbedding(claimText);
      await db.insert(knowledgeClaim).values({
        pageId: page.id,
        claimText: claimText.slice(0, 1000),
        embedding,
        claimSource: 'generated',
        sortOrder: idx,
      });
    } catch (claimErr) {
      // per-claim failure is non-fatal — partial claims still written
      console.warn(`[ingest] claim embed/insert failed idx=${idx} rawSourceId=${rawSourceId}: ${String(claimErr)}`);
    }
  }
}

/**
 * Backward-compatible alias for the legacy ingest path. Existing tests
 * (`apps/worker/src/__tests__/integration/two-step-ingest.test.ts`) import
 * `twoStepIngest` directly — keep the name pointing at the legacy impl
 * because the wiki path requires a workspace git repo + LLM responses that
 * the legacy DB-only test does not exercise.
 */
export const twoStepIngest = legacyTwoStepIngest;

/**
 * Wiki two-step ingest pipeline (Phase-W2 §3.1).
 *
 * Step 0 (PII guard) is performed by the caller (`processIngest`).
 *
 * Step A — Analysis LLM     → AnalysisResult + shortlisted existing pages
 * Step B — Generation LLM    → FILE blocks + REVIEW blocks
 * Step C — Validate + commit → temp worktree → atomicWrite → ff-merge → DB
 * Step D — Review queue      → contradictions / sensitivity / pii signals
 *
 * Failure modes:
 *  - Step A/B LLM fault → bubble up; processIngest catches and marks
 *    raw_source.ingestStatus='error' (caller decides retry).
 *  - Step C validate fail → ingest_dlq INSERT, NO commit, return ok=false.
 *  - Worktree cleanup is guaranteed via try/finally inside writeAndCommit.
 *
 * The DoD requires ≥8 page updates per ingest. We do not throw when count
 * is below 8 (the LLM may legitimately produce fewer); instead we surface
 * `result.contentPageCount` so observability can alert.
 */
export async function wikiTwoStepIngest(
  rawSourceId: string,
  workspaceId: string,
  safeText: string,
  sensitivity: string,
  opts: {
    sourceTitle?: string;
    sourceFileName?: string;
    folderContext?: string;
    previousSensitivity?: string;
    piiHits?: string[];
  } = {},
): Promise<{
  ok: boolean;
  pageCount: number;
  commitSha?: string;
  failures: Array<{ path: string; rule: string; detail: string }>;
}> {
  const sourceTitle = opts.sourceTitle ?? `raw_source/${rawSourceId}`;
  const runId = `${Date.now()}-${rawSourceId.slice(0, 8)}`;

  // ── Step A ──
  const stepA = await analyze({
    rawSourceId,
    workspaceId,
    safeText,
    ...(opts.sourceFileName !== undefined ? { sourceFileName: opts.sourceFileName } : {}),
    ...(opts.folderContext !== undefined ? { folderContext: opts.folderContext } : {}),
  });

  // ── Step B ──
  const stepB = await generate({
    rawSourceId,
    workspaceId,
    safeText,
    analysis: stepA.analysis,
    existingPages: stepA.existingPages,
    ...(opts.sourceFileName !== undefined ? { sourceFileName: opts.sourceFileName } : {}),
    ...(opts.folderContext !== undefined ? { folderContext: opts.folderContext } : {}),
  });

  if (stepB.fileBlocks.length === 0) {
    console.warn(
      `[ingest] wikiTwoStepIngest: Generation produced 0 FILE blocks for rawSourceId=${rawSourceId}`,
    );
    // Treat as validate failure with a synthetic rule so observers route via DLQ.
    return {
      ok: false,
      pageCount: 0,
      failures: [{ path: '(none)', rule: 'no-file-blocks', detail: 'Generation LLM produced no FILE blocks' }],
    };
  }

  // ── Step C ──
  const stepC = await writeAndCommit({
    rawSourceId,
    workspaceId,
    fileBlocks: stepB.fileBlocks,
    reviewBlocks: stepB.reviewBlocks,
    sourceSensitivity: sensitivity as WikiSensitivity,
    sourceTitle,
    runId,
    rawText: stepB.rawText,
  });

  if (!stepC.ok) {
    return {
      ok: false,
      pageCount: stepC.contentPageCount,
      failures: stepC.failures,
    };
  }

  // ── Step D ──
  await recordReviewQueue({
    workspaceId,
    rawSourceId,
    ...(stepC.commitSha !== undefined ? { commitSha: stepC.commitSha } : {}),
    analysis: stepA.analysis,
    reviewBlocks: stepB.reviewBlocks,
    affectedPagePaths: stepC.affectedPaths,
    previousSensitivity: (opts.previousSensitivity ?? sensitivity) as WikiSensitivity,
    newSensitivity: sensitivity as WikiSensitivity,
    piiHits: opts.piiHits ?? [],
  });

  console.log(
    `[ingest] wikiTwoStepIngest done rawSourceId=${rawSourceId} ` +
      `commit=${stepC.commitSha?.slice(0, 8)} new=${stepC.newPageCount} ` +
      `updated=${stepC.updatedPageCount} content=${stepC.contentPageCount}`,
  );

  const result: {
    ok: boolean;
    pageCount: number;
    commitSha?: string;
    failures: Array<{ path: string; rule: string; detail: string }>;
  } = {
    ok: true,
    pageCount: stepC.contentPageCount,
    failures: [],
  };
  if (stepC.commitSha !== undefined) result.commitSha = stepC.commitSha;
  return result;
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

    // Manual (수동 입력) source — parsedContent is provided by the user,
    // so skip MinIO download / extractText. Everything downstream
    // (PII guard, two-step ingest) runs identically on the provided text.
    const isManual =
      source.sourceType === 'manual' && typeof source.parsedContent === 'string';

    let extractedText: string;
    if (isManual) {
      extractedText = source.parsedContent!;
    } else {
      if (!source.storagePath) {
        throw new Error(`raw_source has no storagePath: ${rawSourceId}`);
      }
      // Download file from MinIO
      const buffer = await downloadFromMinio(source.storagePath);
      // Extract text
      const mimeType = source.mimeType ?? 'application/octet-stream';
      extractedText = await extractText(buffer, mimeType);
    }

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
    // Track infra/ingest errors so the raw_source row is NOT marked `done`
    // when we silently swallowed an exception — that was previously hiding
    // real failures (e.g. OpenAI 5xx, git repo corruption) from operators.
    let twoStepError: Error | null = null;
    if (featureTwoStepIngest()) {
      try {
        if (featureWikiFsMode()) {
          // W2 path — multi-page wiki update via wiki-fs + git.
          const fileNameOpt: { sourceFileName?: string } = source.storagePath
            ? { sourceFileName: source.storagePath.split('/').pop() ?? source.storagePath }
            : {};
          await wikiTwoStepIngest(
            rawSourceId,
            source.workspaceId,
            safeText,
            newSensitivity,
            {
              sourceTitle: source.storagePath ?? `manual/${rawSourceId}`,
              ...fileNameOpt,
              previousSensitivity: currentSensitivity,
              // PiiHit[] → string[] (kind label) for the review queue payload.
              piiHits: piiHits.map((h) => h.kind),
            },
          );
        } else {
          // Legacy single-page knowledge_page path.
          await legacyTwoStepIngest(rawSourceId, source.workspaceId, safeText, newSensitivity);
        }
      } catch (err) {
        // Log and capture. We intentionally do NOT re-throw so PII-redacted
        // parsedContent still lands on raw_source, but the status reflects
        // the failure (see status branching below).
        twoStepError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[ingest] twoStepIngest failed rawSourceId=${rawSourceId}: ${twoStepError.message}`,
        );
      }
    }
    // ---- End two-step ingest ----

    // Update raw_source with parsed content (redacted).
    // If two-step ingest threw an infra/LLM error, mark status=error and
    // record the failure in metadata so the op console can surface it.
    const finalStatus = twoStepError ? 'error' : 'done';
    const finalMetadata = twoStepError
      ? { wikiIngestError: twoStepError.message.slice(0, 2000) }
      : undefined;
    await db
      .update(rawSource)
      .set({
        parsedContent: safeText,
        ingestStatus: finalStatus,
        ...(finalMetadata !== undefined ? { metadata: finalMetadata } : {}),
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
