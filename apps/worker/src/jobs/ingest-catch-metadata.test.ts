/**
 * apps/worker/src/jobs/ingest-catch-metadata.test.ts
 *
 * Unit tests for the catch-branch metadata merge fix (P0-6).
 * Verifies that when processIngest throws, the existing metadata
 * (piiHits, wikiIngest, etc.) is preserved instead of being overwritten.
 *
 * Uses vi.mock to intercept DB and all heavy dependencies so no real
 * DB or MinIO connection is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock heavy deps before importing ingest ──────────────────────────────────

// DB mock — returns controllable values from select, captures update calls.
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

mockUpdate.mockReturnValue({ set: mockUpdateSet });
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
mockUpdateWhere.mockResolvedValue([]);

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@jarvis/db/schema/file', () => ({
  rawSource: { id: 'id', metadata: 'metadata', ingestStatus: 'ingestStatus', updatedAt: 'updatedAt' },
}));

vi.mock('@jarvis/db/schema/review-queue', () => ({
  reviewQueue: {},
}));

vi.mock('@jarvis/db/schema/knowledge', () => ({
  knowledgePage: {},
  knowledgeClaim: {},
}));

vi.mock('@jarvis/db/feature-flags', () => ({
  featureTwoStepIngest: () => false,
  featureWikiFsMode: () => false,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  sql: vi.fn(),
}));

vi.mock('../lib/minio-client.js', () => ({
  minioClient: { getObject: vi.fn() },
  BUCKET: 'test-bucket',
}));

vi.mock('mammoth', () => ({ convertToHtml: vi.fn() }));
vi.mock('../lib/pdf-parser.js', () => ({ parsePdf: vi.fn() }));
vi.mock('../lib/observability/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../lib/pii-redactor.js', () => ({
  detectSecretKeywords: vi.fn().mockReturnValue([]),
  redactPII: vi.fn().mockReturnValue({ redacted: '', hits: [] }),
  computeSensitivity: vi.fn().mockReturnValue('INTERNAL'),
}));
vi.mock('@jarvis/ai/breaker', () => ({ callChatWithFallback: vi.fn() }));
vi.mock('./ingest/analyze.js', () => ({ analyze: vi.fn() }));
vi.mock('./ingest/generate.js', () => ({ generate: vi.fn() }));
vi.mock('./ingest/write-and-commit.js', () => ({ writeAndCommit: vi.fn() }));
vi.mock('./ingest/review-queue.js', () => ({ recordReviewQueue: vi.fn() }));
vi.mock('@jarvis/wiki-fs', () => ({}));

// ── import after mocks are set up ────────────────────────────────────────────

const { ingestHandler } = await import('./ingest.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJob(rawSourceId: string) {
  return {
    data: { rawSourceId },
    id: 'job-1',
    name: 'ingest',
    priority: 0,
    state: 'active' as const,
    retrylimit: 3,
    retrycount: 0,
    retrydelay: 0,
    retrybackoff: false,
    startafter: new Date(),
    startedon: new Date(),
    expirein: { hours: 1 },
    expireInSeconds: 3600,
    createdon: new Date(),
    completedon: null,
    keepuntil: new Date(),
    output: null,
    on_complete: false,
  } as unknown as Parameters<typeof ingestHandler>[0][0];
}

/**
 * Chain mock: db.select({...}).from(...).where(...).limit(1) → resolves rows.
 * The ingest module calls `.select({ metadata: rawSource.metadata })` first
 * (for existing metadata in catch), then `.select()` (for the source row).
 */
function setupSelectChain(responses: unknown[][]) {
  let call = 0;
  mockSelect.mockImplementation(() => {
    const rows = responses[call++] ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ingest catch-branch metadata merge (P0-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
  });

  it('preserves existing metadata (piiHits, wikiIngest) and appends error + errorAt', async () => {
    const existingMetadata = {
      piiHits: ['email-1'],
      wikiIngest: { commitSha: 'abc123' },
    };

    // First select call (source row) → throws to enter catch.
    // But actually: ingest first calls update(processing), then select(source).
    // We arrange: first select returns null source (triggers throw inside try),
    // second select (in catch) returns existingMetadata row.
    setupSelectChain([
      // 1st call: source lookup — returns empty → "not found" throw
      [],
      // 2nd call: catch metadata re-read
      [{ metadata: existingMetadata }],
    ]);

    const job = makeJob('raw-source-uuid-1');
    await expect(ingestHandler([job])).rejects.toThrow('raw_source not found');

    // find the update call that sets ingestStatus: 'error'
    const setArgs = mockUpdateSet.mock.calls.find(
      (c) => c[0]?.ingestStatus === 'error',
    )?.[0] as Record<string, unknown> | undefined;

    expect(setArgs).toBeDefined();
    const meta = setArgs!.metadata as Record<string, unknown>;

    // Existing fields preserved
    expect(meta['piiHits']).toEqual(['email-1']);
    expect(meta['wikiIngest']).toEqual({ commitSha: 'abc123' });

    // Error fields added
    expect(typeof meta['error']).toBe('string');
    expect(typeof meta['errorAt']).toBe('string');

    // No metadataReadFailed flag (read succeeded)
    expect(meta['metadataReadFailed']).toBeUndefined();

    // ingestStatus and updatedAt present
    expect(setArgs!.ingestStatus).toBe('error');
    expect(setArgs!.updatedAt).toBeInstanceOf(Date);
  });

  it('uses fallback metadata with metadataReadFailed:true when SELECT fails', async () => {
    // First select (source lookup) returns empty → throw
    // Second select (catch re-read) also throws → fallback path
    let call = 0;
    mockSelect.mockImplementation(() => {
      call++;
      if (call === 1) {
        // source lookup: no row → "not found"
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => Promise.resolve([]),
        };
        return chain;
      }
      // catch re-read: DB error
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.reject(new Error('DB connection lost')),
      };
      return chain;
    });

    const job = makeJob('raw-source-uuid-2');
    await expect(ingestHandler([job])).rejects.toThrow('raw_source not found');

    const setArgs = mockUpdateSet.mock.calls.find(
      (c) => c[0]?.ingestStatus === 'error',
    )?.[0] as Record<string, unknown> | undefined;

    expect(setArgs).toBeDefined();
    const meta = setArgs!.metadata as Record<string, unknown>;

    expect(meta['metadataReadFailed']).toBe(true);
    expect(typeof meta['error']).toBe('string');
    expect(typeof meta['errorAt']).toBe('string');
  });

  it('always sets ingestStatus:error and updatedAt on catch', async () => {
    setupSelectChain([[], [{ metadata: {} }]]);

    const job = makeJob('raw-source-uuid-3');
    await expect(ingestHandler([job])).rejects.toThrow();

    const setArgs = mockUpdateSet.mock.calls.find(
      (c) => c[0]?.ingestStatus === 'error',
    )?.[0] as Record<string, unknown> | undefined;

    expect(setArgs?.ingestStatus).toBe('error');
    expect(setArgs?.updatedAt).toBeInstanceOf(Date);
  });

  it('re-throws original error so pg-boss can retry', async () => {
    setupSelectChain([[], [{ metadata: {} }]]);

    const job = makeJob('raw-source-uuid-4');
    await expect(ingestHandler([job])).rejects.toThrow('raw_source not found: raw-source-uuid-4');
  });
});
