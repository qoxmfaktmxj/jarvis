import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyApiPermission } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { Client } from 'minio';
import { nanoid } from 'nanoid';
import { getUploadPolicy, validateUploadAgainstPolicy } from '@/lib/server/validateUpload';

const UPLOAD_PERMISSIONS = [
  PERMISSIONS.SALES_ADMIN,
  PERMISSIONS.KNOWLEDGE_ADMIN,
  PERMISSIONS.PROJECT_ADMIN,
  PERMISSIONS.NOTICE_ADMIN,
  PERMISSIONS.MAINTENANCE_ADMIN,
] as const;

const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';
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
  /**
   * Optional resourceType hint. When provided AND it matches a registered
   * upload-policy (e.g. `sales_contract_upload`), the strict per-resource
   * size+MIME gate is applied here at presign — not just at finalize. This
   * closes the A3 P0-1 bypass where omitting resourceType let the client
   * fall through to the broad 50MB presign allowlist.
   */
  resourceType: z.string().max(80).optional(),
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
  const auth = await requireAnyApiPermission(req, UPLOAD_PERMISSIONS);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { filename, mimeType, sizeBytes, resourceType } = parsed.data;

  // A3 P0-1 — Resource-type aware policy enforcement at presign.
  // If the client declares a resourceType with a registered stricter policy
  // (e.g. sales_contract_upload → 10MB + xlsx-only), apply that policy here.
  // Without a registered policy, fall through to the broad presign allowlist.
  const policyCheck = validateUploadAgainstPolicy(resourceType, sizeBytes, mimeType);
  if (!policyCheck.ok) {
    return NextResponse.json({ error: policyCheck.error }, { status: 400 });
  }

  // Only enforce the broad presign allowlist when there is NO stricter
  // resource-specific policy — the policy registry already handled it above
  // and using the broad allowlist here would mistakenly accept MIME types
  // the resource policy intentionally forbids.
  if (!getUploadPolicy(resourceType)) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: `MIME type not allowed: ${mimeType}` }, { status: 400 });
    }

    if (sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
    }
  }

  const workspaceId = session.workspaceId;
  const userId = session.userId;
  // A3 P0-1 — encode resourceType into the objectKey path so /api/upload can
  // re-derive the policy server-side (independent of the client-supplied
  // resourceType in the finalize request body). The path component is a
  // server-allocated literal (`sales_contract_upload`), not user input.
  const resourcePrefix = resourceType && getUploadPolicy(resourceType)
    ? `${encodeURIComponent(resourceType)}/`
    : '';
  const objectKey = `${workspaceId}/${userId}/${resourcePrefix}${nanoid()}-${sanitizeFilename(filename)}`;

  const minioClient = getMinioClient();
  const presignedUrl = await minioClient.presignedPutObject(BUCKET, objectKey, 60 * 60);

  return NextResponse.json({ presignedUrl, objectKey });
}
