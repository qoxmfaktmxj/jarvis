import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { reviewQueue } from '@jarvis/db/schema/review-queue';
// @legacy-rag — knowledgePage/knowledgeClaim DB 경로. Phase-W4에서 삭제 예정.
// 현재 featureWikiFsMode=true 분기에서는 이 경로를 타지 않음 (legacyTwoStepIngest 전용).
import { knowledgePage, knowledgeClaim } from '@jarvis/db/schema/knowledge';
import {
  featureTwoStepIngest,
  featureWikiFsMode,
} from '@jarvis/db/feature-flags';
import { eq, sql } from 'drizzle-orm';
import * as mammoth from 'mammoth';
import { logger } from '../lib/observability/index.js';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { parsePdf } from '../lib/pdf-parser.js';
import {
  detectSecretKeywords,
  redactPII,
  type Sensitivity,
} from '../lib/pii-redactor.js';
// Phase-Harness (2026-04-23): embedding 제거. generateEmbedding import 삭제.
import { callChatWithFallback } from '@jarvis/ai/breaker';
import { analyze } from './ingest/analyze.js';
import { generate } from './ingest/generate.js';
import { writeAndCommit } from './ingest/write-and-commit.js';
import { recordReviewQueue } from './ingest/review-queue.js';
import type { WikiSensitivity } from '@jarvis/wiki-fs';

export interface IngestJobData {
  rawSourceId: string;
}

/**
 * Shared result type for both wiki and legacy ingest pipelines.
 * `processIngest()` inspects `ok` to decide `finalStatus`.
 */
export interface IngestExecutionResult {
  ok: boolean;
  mode: 'wiki' | 'legacy';
  pageCount: number;
  commitSha?: string;
  failures: Array<{ path: string; rule: string; detail: string }>;
  errorMessage?: string;
}

const INGEST_MODEL = process.env['INGEST_AI_MODEL'] ?? 'gpt-5.4-mini';

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
 * LLM synthesis → upsert knowledge_page (draft, generated) + knowledge_claims
 * (non-fatal: LLM errors are caught and logged)
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
): Promise<IngestExecutionResult> {
  // ---- LLM synthesis → knowledge_page (draft, generated) ----
  const truncated = safeText.slice(0, 12000); // ~3k tokens context budget
  const systemPrompt = `You are a knowledge extraction assistant. Given a document, produce a JSON object with:
- "title": concise page title (max 100 chars)
- "summary": 2-3 sentence summary of the document
- "claims": array of 3–5 key factual claims (each max 200 chars), as plain strings

Respond ONLY with valid JSON. No markdown fences. No extra text.`;

  const userPrompt = `Document:\n\n${truncated}`;

  let synthesis: { title: string; summary: string; claims: string[] };
  try {
    // Phase-W1.5 — gateway-aware (FEATURE_SUBSCRIPTION_INGEST) with circuit
    // breaker fallback to OPENAI_API_KEY direct on 3 consecutive failures.
    const resp = await callChatWithFallback('ingest', {
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
    return { ok: false, mode: 'legacy', pageCount: 0, failures: [], errorMessage: `LLM synthesis failed: ${String(err)}` };
  }

  if (!synthesis.title || !synthesis.summary) {
    return { ok: false, mode: 'legacy', pageCount: 0, failures: [], errorMessage: 'LLM returned empty title or summary' };
  }

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

  if (!page) return {
    ok: false,
    mode: 'legacy' as const,
    pageCount: 0,
    failures: [],
    errorMessage: 'knowledge_page upsert returned empty',
  };

  // Delete old generated claims (idempotent re-run)
  await db.delete(knowledgeClaim).where(
    sql`page_id = ${page.id}::uuid AND claim_source = 'generated'`,
  );

  const claims = (synthesis.claims ?? []).slice(0, 5);
  // Phase-Harness (2026-04-23): claim embedding 제거. text 만 저장.
  for (let idx = 0; idx < claims.length; idx++) {
    const claimText = claims[idx]!;
    try {
      await db.insert(knowledgeClaim).values({
        pageId: page.id,
        claimText: claimText.slice(0, 1000),
        claimSource: 'generated',
        sortOrder: idx,
      });
    } catch (claimErr) {
      // per-claim failure is non-fatal — partial claims still written
      console.warn(`[ingest] claim insert failed idx=${idx} rawSourceId=${rawSourceId}: ${String(claimErr)}`);
    }
  }

  return { ok: true, mode: 'legacy', pageCount: 1, failures: [] };
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
  const startMs = Date.now();
  logger.info({ rawSourceId }, '[ingest] start');

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
      logger.warn(
        { rawSourceId, keywords: secretHits, durationMs: Date.now() - startMs },
        '[ingest] SECRET hit — queued for review',
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
    let ingestResult: IngestExecutionResult | null = null;
    if (featureTwoStepIngest()) {
      try {
        if (featureWikiFsMode()) {
          // W2 path — multi-page wiki update via wiki-fs + git.
          const fileNameOpt: { sourceFileName?: string } = source.storagePath
            ? { sourceFileName: source.storagePath.split('/').pop() ?? source.storagePath }
            : {};
          const wikiResult = await wikiTwoStepIngest(
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
          ingestResult = {
            ok: wikiResult.ok,
            mode: 'wiki',
            pageCount: wikiResult.pageCount,
            commitSha: wikiResult.commitSha,
            failures: wikiResult.failures,
          };
        } else {
          // Legacy single-page knowledge_page path.
          ingestResult = await legacyTwoStepIngest(rawSourceId, source.workspaceId, safeText, newSensitivity);
        }
      } catch (err) {
        // Log and capture. We intentionally do NOT re-throw so PII-redacted
        // parsedContent still lands on raw_source, but the status reflects
        // the failure (see status branching below).
        twoStepError = err instanceof Error ? err : new Error(String(err));
        logger.warn(
          { rawSourceId, err: twoStepError },
          '[ingest] twoStepIngest failed',
        );
      }
    }
    // ---- End two-step ingest ----

    // Update raw_source with parsed content (redacted).
    // Mark status=error when: (a) infra exception was caught, or (b) ingest
    // returned ok=false (e.g. validate failure, LLM empty response).
    const finalStatus = twoStepError || (ingestResult && !ingestResult.ok) ? 'error' : 'done';

    // Spread-merge metadata so existing keys (e.g. PII hits) are preserved.
    const existingMetadata = (source.metadata ?? {}) as Record<string, unknown>;
    const wikiIngest = ingestResult
      ? {
          ok: ingestResult.ok,
          mode: ingestResult.mode,
          pageCount: ingestResult.pageCount,
          commitSha: ingestResult.commitSha ?? null,
          failures: ingestResult.ok ? [] : ingestResult.failures,
          error: ingestResult.ok
            ? null
            : (ingestResult.errorMessage ?? twoStepError?.message ?? null),
        }
      : twoStepError
        ? { ok: false, mode: 'unknown' as const, pageCount: 0, commitSha: null, failures: [], error: twoStepError.message.slice(0, 2000) }
        : undefined;

    const finalMetadata = wikiIngest
      ? { ...existingMetadata, wikiIngest }
      : existingMetadata;

    await db
      .update(rawSource)
      .set({
        parsedContent: safeText,
        ingestStatus: finalStatus,
        metadata: finalMetadata,
        updatedAt: new Date(),
      })
      .where(eq(rawSource.id, rawSourceId));

    const durationMs = Date.now() - startMs;
    if (twoStepError) {
      logger.error(
        { rawSourceId, durationMs, chars: safeText.length, err: twoStepError },
        '[ingest] failed (two-step error, raw_source marked error)',
      );
    } else {
      logger.info(
        { rawSourceId, durationMs, chars: safeText.length },
        '[ingest] success',
      );
    }
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ rawSourceId, durationMs, err }, '[ingest] failed');
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
