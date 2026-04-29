import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type Readable } from 'node:stream';
import { Client } from 'minio';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { rawSource, attachment } from '@jarvis/db/schema/file';
import { auditLog } from '@jarvis/db/schema/audit';
import { verifyMagicBytes } from '@/lib/upload/magic-bytes';
import PgBoss from 'pg-boss';

const uploadSchema = z.object({
  objectKey: z.string().min(1),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
});

const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';
/** Bytes to read from MinIO for magic-byte verification (256 covers all signatures + text heuristic). */
const MAGIC_READ_BYTES = 256;

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

// Module-level singleton — PgBoss must not be instantiated per-request
// (each instance opens its own connection pool)
let _boss: PgBoss | null = null;
let _bossStarted = false;

async function getBoss(): Promise<PgBoss> {
  if (!_boss) {
    _boss = new PgBoss({ connectionString: process.env['DATABASE_URL']! });
  }
  if (!_bossStarted) {
    await _boss.start();
    _bossStarted = true;
  }
  return _boss;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'files:write');
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { objectKey, filename, mimeType, sizeBytes, resourceType, resourceId } = parsed.data;

  // ── Path traversal guard ──────────────────────────────────────────────────
  // objectKey must start with "<workspaceId>/<userId>/" — workspace + user scope
  const allowedPrefix = `${session.workspaceId}/${session.userId}/`;
  if (!objectKey.startsWith(allowedPrefix)) {
    return NextResponse.json({ error: 'forbidden_object_key' }, { status: 400 });
  }

  // ── Magic-byte verification (server-side, second line of defense) ─────────
  // Prevents ingest pipeline from running on spoofed files, even if finalize
  // was skipped by a client that calls /api/upload directly.
  try {
    const minio = getMinioClient();
    const stream = await minio.getPartialObject(BUCKET, objectKey, 0, MAGIC_READ_BYTES) as unknown as Readable;
    const bytes = await readPartialBytes(stream, MAGIC_READ_BYTES);
    const magicResult = verifyMagicBytes(bytes, mimeType);

    if (!magicResult.ok) {
      // Best-effort cleanup: delete the spoofed object
      try {
        await minio.removeObject(BUCKET, objectKey);
      } catch (removeErr) {
        // Best-effort audit log for orphan object — do not block response
        db.insert(auditLog).values({
          workspaceId: session.workspaceId,
          userId: session.userId,
          action: 'upload.magic_mismatch_orphan',
          resourceType: 'upload',
          details: { objectKey, reason: String(removeErr) },
          success: false,
        }).catch(() => undefined);
        console.error('[upload] removeObject failed after magic mismatch:', removeErr);
      }

      return NextResponse.json(
        {
          error: 'magic_byte_mismatch',
          declared: mimeType,
          reason: magicResult.reason,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error('[upload] Magic-byte check failed:', err);
    return NextResponse.json({ error: 'upload_verification_failed' }, { status: 500 });
  }

  // Insert raw_source record
  const [insertedSource] = await db
    .insert(rawSource)
    .values({
      workspaceId: session.workspaceId,
      sourceType: 'upload',
      originalFilename: filename,
      mimeType,
      sizeBytes,
      storagePath: objectKey,
      ingestStatus: 'pending',
      uploadedBy: session.userId,
    })
    .returning({ id: rawSource.id });

  const rawSourceId = insertedSource!.id;

  // If resource context provided, create attachment record
  if (resourceType && resourceId) {
    await db.insert(attachment).values({
      rawSourceId,
      workspaceId: session.workspaceId,
      resourceType,
      resourceId,
    });
  }

  // Enqueue ingest job (singleton PgBoss — no per-request start/stop)
  const boss = await getBoss();
  await boss.send('ingest', { rawSourceId });

  // If archive type and auto-build enabled, enqueue graphify-build for structural analysis
  const ARCHIVE_MIME_TYPES = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-gzip',
    'application/x-7z-compressed',
  ]);
  const autoGraphify = process.env['GRAPHIFY_AUTO_BUILD'] !== 'false';
  if (autoGraphify && ARCHIVE_MIME_TYPES.has(mimeType)) {
    await boss.send('graphify-build', {
      rawSourceId,
      workspaceId: session.workspaceId,
      requestedBy: session.userId,
      mode: 'standard',
    });
    console.log(
      `[upload] Enqueued graphify-build for archive rawSourceId=${rawSourceId}`,
    );
  }

  return NextResponse.json({ rawSourceId }, { status: 201 });
}
