// apps/worker/src/__tests__/integration/two-step-ingest.test.ts
// Integration test for Phase-7B two-step ingest pipeline.
// Requires DATABASE_URL or INTEGRATION_TEST env var to run against a real DB.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@jarvis/db/client';
import { workspace } from '@jarvis/db/schema/tenant';
import { rawSource } from '@jarvis/db/schema/file';
import { documentChunks } from '@jarvis/db/schema/document-chunks';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { eq, and } from 'drizzle-orm';

// Set env flags before importing ingest (vitest ESM — flags must be set early)
process.env['FEATURE_TWO_STEP_INGEST'] = 'true';
process.env['FEATURE_DOCUMENT_CHUNKS_WRITE'] = 'true';
// Use a dummy key so LLM calls fail gracefully (non-fatal path)
process.env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? 'dummy-key-for-test';

const DB_AVAILABLE =
  !!process.env['DATABASE_URL'] || !!process.env['INTEGRATION_TEST'];

const SAMPLE_TEXT =
  'This is a test document about internal HR policies for onboarding new employees. ' +
  'It covers leave policy, benefits, and code of conduct. ' +
  'All employees must complete onboarding within 30 days of joining.';

describe.skipIf(!DB_AVAILABLE)('two-step ingest integration (Phase-7B)', () => {
  let testWorkspaceId: string;
  let testRawSourceId: string;

  beforeAll(async () => {
    // Seed workspace (upsert by code)
    const [ws] = await db
      .insert(workspace)
      .values({ code: 'test-7b-ingest', name: 'Test 7B Ingest' })
      .onConflictDoUpdate({
        target: workspace.code,
        set: { name: 'Test 7B Ingest' },
      })
      .returning({ id: workspace.id });
    testWorkspaceId = ws!.id;

    // Seed raw_source
    const [rs] = await db
      .insert(rawSource)
      .values({
        workspaceId: testWorkspaceId,
        sourceType: 'file',
        storagePath: 'test/test-doc.txt',
        mimeType: 'text/plain',
        ingestStatus: 'done',
        parsedContent: SAMPLE_TEXT,
        sensitivity: 'INTERNAL',
      })
      .returning({ id: rawSource.id });
    testRawSourceId = rs!.id;
  });

  afterAll(async () => {
    // Clean up in reverse FK order
    await db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, testRawSourceId));
    await db.delete(knowledgePage).where(
      and(
        eq(knowledgePage.workspaceId, testWorkspaceId),
        eq(knowledgePage.sourceType, 'raw_source'),
        eq(knowledgePage.sourceKey, testRawSourceId),
      ),
    );
    await db.delete(rawSource).where(eq(rawSource.id, testRawSourceId));
    // Only remove the workspace we created (other tests may share)
    await db.delete(workspace).where(eq(workspace.code, 'test-7b-ingest'));
  });

  it('writes document_chunks rows when FEATURE_DOCUMENT_CHUNKS_WRITE=true', async () => {
    const { twoStepIngest } = await import('../../jobs/ingest.js');

    await twoStepIngest(testRawSourceId, testWorkspaceId, SAMPLE_TEXT, 'INTERNAL');

    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, testRawSourceId));

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.content).toBeTruthy();
    expect(chunks[0]!.contentHash).toHaveLength(64); // SHA-256 hex
    expect(chunks[0]!.documentType).toBe('raw_source');
    expect(chunks[0]!.workspaceId).toBe(testWorkspaceId);
  });

  it('does not create knowledge_page when LLM call fails with dummy key', async () => {
    // With dummy OPENAI_API_KEY the LLM step fails gracefully — no page created.
    // The test still passes because LLM errors are non-fatal.
    const pages = await db
      .select()
      .from(knowledgePage)
      .where(
        and(
          eq(knowledgePage.workspaceId, testWorkspaceId),
          eq(knowledgePage.sourceType, 'raw_source'),
          eq(knowledgePage.sourceKey, testRawSourceId),
        ),
      );

    if (process.env['OPENAI_API_KEY'] === 'dummy-key-for-test') {
      // LLM fails → no page created; this is the expected graceful-degradation path
      expect(pages.length).toBe(0);
    } else {
      // Real key: page should be created as draft with generated authority
      expect(pages.length).toBe(1);
      expect(pages[0]!.publishStatus).toBe('draft');
      expect(pages[0]!.authority).toBe('generated');
    }
  });

  it('is idempotent — re-running twoStepIngest does not create duplicate chunks', async () => {
    const { twoStepIngest } = await import('../../jobs/ingest.js');

    await twoStepIngest(testRawSourceId, testWorkspaceId, SAMPLE_TEXT, 'INTERNAL');

    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, testRawSourceId));

    // Count should be the same as after the first call (upsert, not insert)
    const firstRunCount = chunks.length;

    await twoStepIngest(testRawSourceId, testWorkspaceId, SAMPLE_TEXT, 'INTERNAL');

    const chunksAfterSecondRun = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, testRawSourceId));

    expect(chunksAfterSecondRun.length).toBe(firstRunCount);
  });
});
