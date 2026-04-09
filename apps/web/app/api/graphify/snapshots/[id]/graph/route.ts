// apps/web/app/api/graphify/snapshots/[id]/graph/route.ts
// TODO: Extract MinIO client to packages/storage/minio.ts for worker/web sharing

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and } from 'drizzle-orm';
import { Client } from 'minio';

// Inline MinIO client — share with worker via packages/storage in the future
const minioClient = new Client({
  endPoint: process.env['MINIO_ENDPOINT']!,
  port: parseInt(process.env['MINIO_PORT'] ?? '9000', 10),
  useSSL: process.env['MINIO_USE_SSL'] === 'true',
  accessKey: process.env['MINIO_ACCESS_KEY']!,
  secretKey: process.env['MINIO_SECRET_KEY']!,
});
const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;
  const { id } = await params;

  const [snapshot] = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.id, id),
        eq(graphSnapshot.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  // ?type=html for graph.html, default is graph.json
  const fileType = req.nextUrl.searchParams.get('type') ?? 'json';
  const storagePath =
    fileType === 'html' ? snapshot.graphHtmlPath : snapshot.graphJsonPath;

  if (!storagePath) {
    return NextResponse.json(
      { error: `graph.${fileType} not available for this snapshot` },
      { status: 404 },
    );
  }

  // Return presigned URL as JSON (60s validity)
  // Client loads it directly into iframe src
  const url = await minioClient.presignedGetObject(BUCKET, storagePath, 60);

  return NextResponse.json({ url });
}
