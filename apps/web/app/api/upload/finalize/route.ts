import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type Readable } from 'node:stream';
import { Client } from 'minio';
import { requireApiSession } from '@/lib/server/api-auth';
import { verifyMagicBytes } from '@/lib/upload/magic-bytes';

const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';
/** Bytes to read from MinIO for magic-byte verification (256 covers all signatures + text heuristic). */
const MAGIC_READ_BYTES = 256;

const finalizeSchema = z.object({
  objectKey: z.string().min(1).max(1024),
  declaredMimeType: z.string().min(1),
});

function getMinioClient(): Client {
  return new Client({
    endPoint: process.env['MINIO_ENDPOINT']!,
    port: parseInt(process.env['MINIO_PORT'] || '9000'),
    useSSL: process.env['MINIO_USE_SSL'] === 'true',
    accessKey: process.env['MINIO_ACCESS_KEY']!,
    secretKey: process.env['MINIO_SECRET_KEY']!,
  });
}

/** Read first `length` bytes from a MinIO object stream into a Uint8Array. */
async function readPartialBytes(stream: Readable, length: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= length) {
        stream.destroy();
      }
    });

    stream.on('end', () => {
      const buf = Buffer.concat(chunks).subarray(0, length);
      resolve(new Uint8Array(buf));
    });

    stream.on('close', () => {
      const buf = Buffer.concat(chunks).subarray(0, length);
      resolve(new Uint8Array(buf));
    });

    stream.on('error', reject);
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await requireApiSession(req, 'files:write');
  if (auth.response) return auth.response;
  const { session } = auth;

  // ── Validate body ─────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null);
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { objectKey, declaredMimeType } = parsed.data;

  // ── Path traversal guard ──────────────────────────────────────────────────
  // objectKey must start with "<workspaceId>/<userId>/" — workspace + user scope
  const allowedPrefix = `${session.workspaceId}/${session.userId}/`;
  if (!objectKey.startsWith(allowedPrefix)) {
    return NextResponse.json({ error: 'forbidden_object_key' }, { status: 400 });
  }

  // ── MinIO partial read + magic-byte verification ──────────────────────────
  try {
    const minio = getMinioClient();
    const stream = await minio.getPartialObject(BUCKET, objectKey, 0, MAGIC_READ_BYTES) as unknown as Readable;
    const bytes = await readPartialBytes(stream, MAGIC_READ_BYTES);

    const result = verifyMagicBytes(bytes, declaredMimeType);

    if (!result.ok) {
      // Delete the object to prevent serving a spoofed file
      try {
        await minio.removeObject(BUCKET, objectKey);
      } catch (removeErr) {
        // Log but don't surface the internal error
        console.error('[finalize] removeObject failed after magic mismatch:', removeErr);
      }

      return NextResponse.json(
        {
          error: 'magic_byte_mismatch',
          declared: declaredMimeType,
          reason: result.reason,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, objectKey });
  } catch (err) {
    console.error('[finalize] Unexpected error during magic-byte check:', err);
    return NextResponse.json({ error: 'finalize_failed' }, { status: 500 });
  }
}
