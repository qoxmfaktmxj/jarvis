import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { rawSource, attachment } from '@jarvis/db/schema/file';
import PgBoss from 'pg-boss';

const uploadSchema = z.object({
  objectKey: z.string().min(1),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
});

function getBoss(): PgBoss {
  return new PgBoss({ connectionString: process.env['DATABASE_URL']! });
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

  // Enqueue ingest job
  const boss = getBoss();
  await boss.start();
  await boss.send('ingest', { rawSourceId });
  await boss.stop();

  return NextResponse.json({ rawSourceId }, { status: 201 });
}
