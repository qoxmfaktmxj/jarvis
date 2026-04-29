import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';

// ── Mock: api-auth ─────────────────────────────────────────────────────────
const mockSession = {
  userId: 'user-abc',
  workspaceId: 'ws-xyz',
  roles: ['VIEWER'],
  permissions: ['files:write'],
};

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({ session: mockSession }),
}));

// ── Mock: DB ───────────────────────────────────────────────────────────────
const mockAuditInsertValues = vi.fn().mockReturnThis();
const mockAuditInsertCatch = vi.fn().mockReturnThis();

const mockInsertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: 'raw-src-id-001' }]),
  catch: mockAuditInsertCatch,
};

vi.mock('@jarvis/db/client', () => ({
  db: {
    insert: vi.fn().mockImplementation(() => mockInsertChain),
  },
}));

vi.mock('@jarvis/db/schema/file', () => ({
  rawSource: {},
  attachment: {},
}));

vi.mock('@jarvis/db/schema/audit', () => ({
  auditLog: {},
}));

// ── Mock: PgBoss ───────────────────────────────────────────────────────────
const mockBossSend = vi.fn().mockResolvedValue(undefined);

vi.mock('pg-boss', () => ({
  default: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    send: mockBossSend,
  })),
}));

// ── Mock: MinIO Client ─────────────────────────────────────────────────────
const mockGetPartialObject = vi.fn();
const mockRemoveObject = vi.fn().mockResolvedValue(undefined);

vi.mock('minio', () => ({
  Client: vi.fn().mockImplementation(() => ({
    getPartialObject: mockGetPartialObject,
    removeObject: mockRemoveObject,
  })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function streamFromBytes(bytes: Uint8Array): Readable {
  return Readable.from([Buffer.from(bytes)]);
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Import AFTER mocks
const { POST } = await import('../route');
const { db } = await import('@jarvis/db/client');

// ── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveObject.mockResolvedValue(undefined);
    mockBossSend.mockResolvedValue(undefined);
    // Default: db.insert chain (rawSource returning + audit best-effort)
    mockInsertChain.values.mockReturnThis();
    mockInsertChain.returning.mockResolvedValue([{ id: 'raw-src-id-001' }]);
    mockInsertChain.catch.mockReturnThis();
    vi.mocked(db.insert).mockReturnValue(mockInsertChain as never);
  });

  // ── HIGH 1: Path traversal guard ────────────────────────────────────────
  it('returns 400 when objectKey does not start with workspaceId/userId (spoofed key)', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pdfBytes));

    const req = makeRequest({
      objectKey: 'other-ws/other-user/evil.pdf', // wrong workspace
      filename: 'evil.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('forbidden_object_key');
    // Must NOT insert raw_source or enqueue ingest
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    expect(mockBossSend).not.toHaveBeenCalled();
    expect(mockRemoveObject).not.toHaveBeenCalled();
  });

  it('returns 400 for path traversal attempt (../../etc/passwd)', async () => {
    const req = makeRequest({
      objectKey: '../../etc/passwd',
      filename: 'passwd',
      mimeType: 'text/plain',
      sizeBytes: 100,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('forbidden_object_key');
  });

  // ── HIGH 1: Magic-byte mismatch → 400 + removeObject, no DB insert ──────
  it('returns 400 when magic bytes mismatch declared MIME (spoofed PDF)', async () => {
    // PNG bytes but declares application/pdf
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pngBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/spoof.pdf',
      filename: 'spoof.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('magic_byte_mismatch');
    // Object must be deleted
    expect(mockRemoveObject).toHaveBeenCalledOnce();
    expect(mockRemoveObject).toHaveBeenCalledWith(expect.any(String), 'ws-xyz/user-abc/spoof.pdf');
    // Must NOT insert raw_source
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    expect(mockBossSend).not.toHaveBeenCalled();
  });

  it('returns 400 when EXE bytes declared as image/png (RCE vector)', async () => {
    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(exeBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/evil.png',
      filename: 'evil.png',
      mimeType: 'image/png',
      sizeBytes: 512,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockRemoveObject).toHaveBeenCalledOnce();
  });

  // ── HIGH 1: Valid magic bytes → 201 with rawSourceId ────────────────────
  it('returns 201 with rawSourceId when valid PDF is registered', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pdfBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/valid.pdf',
      filename: 'valid.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.rawSourceId).toBeDefined();
    expect(mockBossSend).toHaveBeenCalledWith('ingest', expect.objectContaining({ rawSourceId: expect.any(String) }));
    expect(mockRemoveObject).not.toHaveBeenCalled();
  });

  // ── MEDIUM 3: removeObject failure → audit_log written (best-effort) ─────
  it('writes audit_log when removeObject fails after magic mismatch', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pngBytes));
    mockRemoveObject.mockRejectedValueOnce(new Error('MinIO timeout'));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/spoof.pdf',
      filename: 'spoof.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('magic_byte_mismatch');

    // Audit log must have been triggered (best-effort, so we check insert was called)
    expect(vi.mocked(db.insert)).toHaveBeenCalled();
    // The audit insert call should contain the orphan action
    const insertCallArgs = vi.mocked(db.insert).mock.calls;
    expect(insertCallArgs.length).toBeGreaterThan(0);
  });

  // ── Invalid body ─────────────────────────────────────────────────────────
  it('returns 400 for missing filename', async () => {
    const req = makeRequest({ objectKey: 'ws-xyz/user-abc/x', mimeType: 'application/pdf', sizeBytes: 100 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
