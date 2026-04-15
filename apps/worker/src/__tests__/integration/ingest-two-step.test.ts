/**
 * apps/worker/src/__tests__/integration/ingest-two-step.test.ts
 *
 * W2-T1 integration test for the wiki-fs ingest path (`wikiTwoStepIngest`).
 * Mocks the OpenAI client so we can assert on FILE-block fan-out without
 * burning real tokens, and validates:
 *   - ≥8 page updates (DoD requirement) when LLM output meets contract.
 *   - validate failure (broken wikilink, aliases<3) → ingest_dlq INSERT
 *     and NO commit lands in main.
 *   - temp worktree cleanup is guaranteed even on validate failure.
 *
 * Requires DATABASE_URL or INTEGRATION_TEST env var to run against a real DB.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '@jarvis/db/client';
import { workspace } from '@jarvis/db/schema/tenant';
import { rawSource } from '@jarvis/db/schema/file';
import { wikiPageIndex } from '@jarvis/db/schema/wiki-page-index';
import { wikiCommitLog } from '@jarvis/db/schema/wiki-commit-log';
import { wikiPageLink } from '@jarvis/db/schema/wiki-page-link';
import { wikiReviewQueue } from '@jarvis/db/schema/wiki-review-queue';
import { eq, and } from 'drizzle-orm';

// Set env BEFORE importing ingest module so feature flags are picked up.
process.env['FEATURE_TWO_STEP_INGEST'] = 'true';
process.env['FEATURE_WIKI_FS_MODE'] = 'true';
process.env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? 'dummy-key-for-test';

const DB_AVAILABLE =
  !!process.env['DATABASE_URL'] || !!process.env['INTEGRATION_TEST'];

// ── OpenAI mock ────────────────────────────────────────────────────────────

interface MockResponses {
  analysisJson: string;
  generationText: string;
}

let _mockResponses: MockResponses = { analysisJson: '{}', generationText: '' };

vi.mock('openai', () => {
  return {
    default: class FakeOpenAI {
      chat = {
        completions: {
          create: async (req: { messages: { content: string }[]; response_format?: { type: string } }) => {
            // Distinguish step A vs step B by response_format hint OR system content marker.
            const sys = req.messages[0]?.content ?? '';
            const isAnalysis = req.response_format?.type === 'json_object' || sys.includes('step: analysis');
            const content = isAnalysis ? _mockResponses.analysisJson : _mockResponses.generationText;
            return {
              choices: [{ message: { content } }],
            };
          },
        },
      };
    },
  };
});

// ── wiki-fs partial mock: spy createTempWorktree so we can assert that
//    - validate-fail paths NEVER open a worktree (no cleanup to call), and
//    - success paths both open AND cleanup the worktree exactly once.
//    We keep the real implementation for every other export.
//
// `vi.hoisted` is required here because `vi.mock` factories run BEFORE any
// top-level const declarations — without it, the spy identifiers would be
// `undefined` when the factory closes over them.
const { _createTempWorktreeSpy, _cleanupSpy } = vi.hoisted(() => ({
  _createTempWorktreeSpy: vi.fn(),
  _cleanupSpy: vi.fn(),
}));

vi.mock('@jarvis/wiki-fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jarvis/wiki-fs')>();
  return {
    ...actual,
    createTempWorktree: async (...args: Parameters<typeof actual.createTempWorktree>) => {
      _createTempWorktreeSpy(...args);
      const handle = await actual.createTempWorktree(...args);
      const originalCleanup = handle.cleanup;
      return {
        ...handle,
        cleanup: async () => {
          _cleanupSpy();
          await originalCleanup();
        },
      };
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────

function buildAnalysisJson(): string {
  return JSON.stringify({
    keyEntities: [
      { name: '인사팀', type: 'organization', aliases: ['HR', '인사부'] },
    ],
    keyConcepts: [
      { name: '연차 정책', summary: '연 15일 기본 연차', relatedPageIds: [] },
    ],
    findings: ['연차 정책이 문서화되지 않음'],
    contradictions: [],
    recommendations: ['연차 정책 페이지 신설'],
  });
}

/** Build a Step-B response with N FILE blocks, all with valid frontmatter. */
function buildGenerationText(workspaceId: string, count: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < count; i++) {
    const slug = `policy-${String(i + 1).padStart(2, '0')}`;
    const block = [
      `---FILE: auto/concepts/${slug}.md---`,
      '---',
      `title: "정책 ${i + 1}"`,
      'type: concept',
      `workspaceId: "${workspaceId}"`,
      'sensitivity: INTERNAL',
      'requiredPermission: "knowledge:read"',
      'sources: ["test-source"]',
      `aliases: ["정책", "policy", "${slug}"]`,
      'tags: ["test"]',
      'created: 2026-04-15',
      'updated: 2026-04-15',
      'authority: auto',
      'linkedPages: []',
      '---',
      '',
      `# 정책 ${i + 1}`,
      '',
      '본문 내용입니다.',
      '---END FILE---',
    ].join('\n');
    blocks.push(block);
  }
  return blocks.join('\n\n');
}

function buildBrokenGenerationText(workspaceId: string): string {
  // One block with aliases<3 → validate fails.
  return [
    `---FILE: auto/concepts/broken.md---`,
    '---',
    'title: "Broken"',
    'type: concept',
    `workspaceId: "${workspaceId}"`,
    'sensitivity: INTERNAL',
    'requiredPermission: "knowledge:read"',
    'sources: ["test"]',
    'aliases: ["only-one"]',
    'tags: []',
    'created: 2026-04-15',
    'updated: 2026-04-15',
    'authority: auto',
    'linkedPages: []',
    '---',
    '',
    '# Broken',
    'Content with [[nonexistent-page]] link.',
    '---END FILE---',
  ].join('\n');
}

const REPO_ROOT = path.resolve(__dirname, '../../../../../');

// ── Tests ─────────────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('wiki two-step ingest integration (W2-T1)', () => {
  let testWorkspaceId: string;
  let testRawSourceId: string;
  let workspaceWikiPath: string;

  beforeAll(async () => {
    const [ws] = await db
      .insert(workspace)
      .values({ code: 'test-w2-ingest', name: 'Test W2 Ingest' })
      .onConflictDoUpdate({
        target: workspace.code,
        set: { name: 'Test W2 Ingest' },
      })
      .returning({ id: workspace.id });
    testWorkspaceId = ws!.id;

    const [rs] = await db
      .insert(rawSource)
      .values({
        workspaceId: testWorkspaceId,
        sourceType: 'manual',
        parsedContent: '인사팀 연차 정책 등 사내 정책에 대한 문서입니다.',
        ingestStatus: 'done',
        sensitivity: 'INTERNAL',
      })
      .returning({ id: rawSource.id });
    testRawSourceId = rs!.id;

    workspaceWikiPath = path.join(REPO_ROOT, 'wiki', testWorkspaceId);
  });

  afterAll(async () => {
    // Clean DB rows.
    await db.delete(wikiPageLink).where(eq(wikiPageLink.workspaceId, testWorkspaceId));
    await db.delete(wikiCommitLog).where(eq(wikiCommitLog.workspaceId, testWorkspaceId));
    await db.delete(wikiReviewQueue).where(eq(wikiReviewQueue.workspaceId, testWorkspaceId));
    await db.delete(wikiPageIndex).where(eq(wikiPageIndex.workspaceId, testWorkspaceId));
    await db.delete(rawSource).where(eq(rawSource.id, testRawSourceId));
    await db.delete(workspace).where(eq(workspace.code, 'test-w2-ingest'));

    // Clean disk: remove test workspace wiki repo.
    await fs.rm(workspaceWikiPath, { recursive: true, force: true }).catch(() => undefined);
  });

  beforeEach(async () => {
    // Reset wiki_page_index for the workspace so the new vs updated count
    // is deterministic across iterations.
    await db.delete(wikiPageLink).where(eq(wikiPageLink.workspaceId, testWorkspaceId));
    await db.delete(wikiPageIndex).where(eq(wikiPageIndex.workspaceId, testWorkspaceId));
    // Reset worktree spies so each test observes only its own calls.
    _createTempWorktreeSpy.mockClear();
    _cleanupSpy.mockClear();
  });

  it('produces ≥8 page updates when LLM emits a multi-page response', async () => {
    _mockResponses = {
      analysisJson: buildAnalysisJson(),
      generationText: buildGenerationText(testWorkspaceId, 8),
    };

    const { wikiTwoStepIngest } = await import('../../jobs/ingest.js');
    const result = await wikiTwoStepIngest(
      testRawSourceId,
      testWorkspaceId,
      '인사팀 연차 정책 등 사내 정책에 대한 문서입니다.',
      'INTERNAL',
      { sourceTitle: 'manual/test', previousSensitivity: 'INTERNAL', piiHits: [] },
    );

    expect(result.ok).toBe(true);
    expect(result.pageCount).toBeGreaterThanOrEqual(8);
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // wiki_page_index should have all 8 pages.
    const rows = await db
      .select()
      .from(wikiPageIndex)
      .where(eq(wikiPageIndex.workspaceId, testWorkspaceId));
    expect(rows.length).toBeGreaterThanOrEqual(8);

    // commit log row exists for this commit.
    const commits = await db
      .select()
      .from(wikiCommitLog)
      .where(
        and(
          eq(wikiCommitLog.workspaceId, testWorkspaceId),
          eq(wikiCommitLog.commitSha, result.commitSha!),
        ),
      );
    expect(commits.length).toBe(1);
    expect(commits[0]!.operation).toBe('ingest');

    // Worktree lifecycle: exactly one open + one cleanup on the success path.
    expect(_createTempWorktreeSpy).toHaveBeenCalledTimes(1);
    expect(_cleanupSpy).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('routes validate failures (aliases<3, broken wikilink) to ingest_dlq without committing', async () => {
    _mockResponses = {
      analysisJson: buildAnalysisJson(),
      generationText: buildBrokenGenerationText(testWorkspaceId),
    };

    const { wikiTwoStepIngest } = await import('../../jobs/ingest.js');
    const result = await wikiTwoStepIngest(
      testRawSourceId,
      testWorkspaceId,
      '테스트 본문',
      'INTERNAL',
      { sourceTitle: 'manual/test', previousSensitivity: 'INTERNAL', piiHits: [] },
    );

    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.some((f) => f.rule === 'aliases<3')).toBe(true);

    // ingest_dlq row exists.
    const dlq = await db
      .select()
      .from(wikiReviewQueue)
      .where(
        and(
          eq(wikiReviewQueue.workspaceId, testWorkspaceId),
          eq(wikiReviewQueue.kind, 'ingest_fail'),
        ),
      );
    expect(dlq.length).toBeGreaterThan(0);

    // No new wiki_page_index row should have landed.
    const rows = await db
      .select()
      .from(wikiPageIndex)
      .where(eq(wikiPageIndex.workspaceId, testWorkspaceId));
    expect(rows.length).toBe(0);
  }, 30_000);

  it('does not open a temp worktree when validate fails before Step C', async () => {
    // This is a stricter invariant than the previous DLQ test: we assert on
    // the worktree spy directly. `writeAndCommit` must short-circuit on
    // validate failure BEFORE calling `createTempWorktree`, so neither the
    // open nor the cleanup hook should fire. This prevents a whole class of
    // "dangling lockfile in .git/worktrees/" regressions.
    _mockResponses = {
      analysisJson: buildAnalysisJson(),
      generationText: buildBrokenGenerationText(testWorkspaceId),
    };

    const { wikiTwoStepIngest } = await import('../../jobs/ingest.js');
    const result = await wikiTwoStepIngest(
      testRawSourceId,
      testWorkspaceId,
      '테스트 본문',
      'INTERNAL',
      { sourceTitle: 'manual/test', previousSensitivity: 'INTERNAL', piiHits: [] },
    );

    expect(result.ok).toBe(false);
    // Validate ran, failed, and routed to DLQ — the worktree helper was never
    // touched, so neither spy should have fired.
    expect(_createTempWorktreeSpy).not.toHaveBeenCalled();
    expect(_cleanupSpy).not.toHaveBeenCalled();

    // DLQ payload must carry rawText (see write-and-commit.ts recordIngestDlq)
    // so operators can diagnose without re-running Step B.
    const dlq = await db
      .select()
      .from(wikiReviewQueue)
      .where(
        and(
          eq(wikiReviewQueue.workspaceId, testWorkspaceId),
          eq(wikiReviewQueue.kind, 'ingest_fail'),
        ),
      );
    expect(dlq.length).toBeGreaterThan(0);
    const payload = dlq[dlq.length - 1]!.payload as { rawText?: string };
    expect(typeof payload.rawText).toBe('string');
    expect(payload.rawText!.length).toBeGreaterThan(0);
  }, 30_000);
});
