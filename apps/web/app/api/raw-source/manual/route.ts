import { NextRequest, NextResponse } from 'next/server';
import PgBoss from 'pg-boss';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createManualRawSourceSchema } from '@jarvis/shared/validation';

// Module-level singleton — mirrors apps/web/app/api/upload/route.ts
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
  const auth = await requireApiSession(req, PERMISSIONS.FILES_WRITE);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json().catch(() => null);
  const parsed = createManualRawSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { title, content, sensitivity, authorNote } = parsed.data;

  const [inserted] = await db
    .insert(rawSource)
    .values({
      workspaceId: session.workspaceId,
      sourceType: 'manual',
      parsedContent: content,
      sensitivity,
      metadata: {
        title,
        authorNote: authorNote ?? null,
        manualInput: true,
      },
      uploadedBy: session.userId,
      ingestStatus: 'pending',
    })
    .returning({ id: rawSource.id });

  const rawSourceId = inserted!.id;

  // Enqueue ingest job — worker branches on sourceType='manual' to skip MinIO download
  const boss = await getBoss();
  await boss.send('ingest', { rawSourceId });

  return NextResponse.json({ rawSourceId }, { status: 201 });
}
