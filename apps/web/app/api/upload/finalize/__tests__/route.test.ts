import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';

// ── Mock: api-auth ────────────────────────────────────────────────────────────
const mockSession = {
  userId: 'user-abc',
  workspaceId: 'ws-xyz',
  roles: ['VIEWER'],
  permissions: ['files:write'],
};

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({ session: mockSession }),
}));

// ── Mock: MinIO Client ────────────────────────────────────────────────────────
const mockGetPartialObject = vi.fn();
const mockRemoveObject = vi.fn();

vi.mock('minio', () => ({
  Client: vi.fn().mockImplementation(() => ({
    getPartialObject: mockGetPartialObject,
    removeObject: mockRemoveObject,
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Build a readable stream from a Uint8Array for mock getPartialObject */
function streamFromBytes(bytes: Uint8Array): Readable {
  return Readable.from([Buffer.from(bytes)]);
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/upload/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Import AFTER mocks are registered
const { POST } = await import('../route');

// ── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/upload/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveObject.mockResolvedValue(undefined);
  });

  // ── Valid path + matching magic bytes → 200 ───────────────────────────────
  it('returns 200 when magic bytes match declared MIME (PDF)', async () => {
    // %PDF- magic
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pdfBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/file123.pdf',
      declaredMimeType: 'application/pdf',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.objectKey).toBe('ws-xyz/user-abc/file123.pdf');
    expect(mockRemoveObject).not.toHaveBeenCalled();
  });

  // ── Valid path + matching magic bytes → 200 (PNG) ────────────────────────
  it('returns 200 when magic bytes match declared MIME (PNG)', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pngBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/img.png',
      declaredMimeType: 'image/png',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockRemoveObject).not.toHaveBeenCalled();
  });

  // ── Magic mismatch → 400 + removeObject called ────────────────────────────
  it('returns 400 and removes object when magic bytes mismatch (PDF declared, PNG bytes)', async () => {
    // PNG magic, but client declared application/pdf
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(pngBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/spoof.pdf',
      declaredMimeType: 'application/pdf',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('magic_byte_mismatch');
    expect(json.declared).toBe('application/pdf');
    expect(mockRemoveObject).toHaveBeenCalledOnce();
    expect(mockRemoveObject).toHaveBeenCalledWith(
      expect.any(String), // BUCKET
      'ws-xyz/user-abc/spoof.pdf'
    );
  });

  // ── Spoof: EXE declared as image/png → 400 ────────────────────────────────
  it('returns 400 for EXE bytes declared as image/png (RCE vector)', async () => {
    // MZ header (Windows PE)
    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(exeBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/evil.png',
      declaredMimeType: 'image/png',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockRemoveObject).toHaveBeenCalledOnce();
  });

  // ── Spoof: HTML declared as text/plain → 400 (XSS vector) ────────────────
  it('returns 400 for HTML bytes declared as text/plain (XSS vector)', async () => {
    const htmlStr = '<html><script>alert(1)</script></html>';
    const htmlBytes = new Uint8Array(htmlStr.length);
    for (let i = 0; i < htmlStr.length; i++) htmlBytes[i] = htmlStr.charCodeAt(i);
    mockGetPartialObject.mockResolvedValue(streamFromBytes(htmlBytes));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/xss.txt',
      declaredMimeType: 'text/plain',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockRemoveObject).toHaveBeenCalledOnce();
  });

  // ── Path traversal guard: objectKey not starting with workspaceId/userId ──
  it('returns 400 for objectKey that does not start with workspaceId/userId', async () => {
    const req = makeRequest({
      objectKey: 'other-workspace/user-abc/file.pdf',
      declaredMimeType: 'application/pdf',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('forbidden_object_key');
    expect(mockGetPartialObject).not.toHaveBeenCalled();
    expect(mockRemoveObject).not.toHaveBeenCalled();
  });

  it('returns 400 for objectKey traversal attempt (../../etc/passwd)', async () => {
    const req = makeRequest({
      objectKey: '../../etc/passwd',
      declaredMimeType: 'text/plain',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockGetPartialObject).not.toHaveBeenCalled();
  });

  // ── Invalid body → 400 ───────────────────────────────────────────────────
  it('returns 400 for missing objectKey', async () => {
    const req = makeRequest({ declaredMimeType: 'application/pdf' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 for missing declaredMimeType', async () => {
    const req = makeRequest({ objectKey: 'ws-xyz/user-abc/file.pdf' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  // ── MinIO getPartialObject failure → 500 ─────────────────────────────────
  it('returns 500 when MinIO getPartialObject throws', async () => {
    mockGetPartialObject.mockRejectedValue(new Error('MinIO connection error'));

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/file.pdf',
      declaredMimeType: 'application/pdf',
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('finalize_failed');
    // Must not leak internal error details
    expect(JSON.stringify(json)).not.toContain('MinIO connection error');
  });

  // ── Unauthorized (mocked requireApiSession returns response) ─────────────
  it('returns 401 when session is missing', async () => {
    const { requireApiSession } = await import('@/lib/server/api-auth');
    vi.mocked(requireApiSession).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const req = makeRequest({
      objectKey: 'ws-xyz/user-abc/file.pdf',
      declaredMimeType: 'application/pdf',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
