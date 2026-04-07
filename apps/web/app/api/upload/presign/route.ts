import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/server/api-auth';
import { Client } from 'minio';
import { nanoid } from 'nanoid';

const BUCKET = 'jarvis-files';
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/zip',
]);

const presignSchema = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getMinioClient(): Client {
  return new Client({
    endPoint: process.env['MINIO_ENDPOINT']!,
    port: parseInt(process.env['MINIO_PORT'] || '9000'),
    useSSL: process.env['MINIO_USE_SSL'] === 'true',
    accessKey: process.env['MINIO_ACCESS_KEY']!,
    secretKey: process.env['MINIO_SECRET_KEY']!,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'files:write');
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { filename, mimeType, sizeBytes } = parsed.data;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `MIME type not allowed: ${mimeType}` }, { status: 400 });
  }

  if (sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
  }

  const workspaceId = session.workspaceId;
  const userId = session.userId;
  const objectKey = `${workspaceId}/${userId}/${nanoid()}-${sanitizeFilename(filename)}`;

  const minioClient = getMinioClient();
  const presignedUrl = await minioClient.presignedPutObject(BUCKET, objectKey, 60 * 60);

  return NextResponse.json({ presignedUrl, objectKey });
}
