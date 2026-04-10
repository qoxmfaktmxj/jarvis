// apps/web/app/api/graphify/build/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/server/api-auth';
import PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { eq } from 'drizzle-orm';

const buildSchema = z.object({
  rawSourceId: z.string().uuid(),
  mode: z.enum(['standard', 'deep']).optional(),
});

// Use globalThis to survive HMR reloads in Next.js development
declare global {
  // eslint-disable-next-line no-var
  var _graphifyBoss: PgBoss | undefined;
  // eslint-disable-next-line no-var
  var _graphifyBossStarted: boolean | undefined;
}

async function getBoss(): Promise<PgBoss> {
  if (!globalThis._graphifyBoss) {
    globalThis._graphifyBoss = new PgBoss({
      connectionString: process.env['DATABASE_URL']!,
    });
  }
  if (!globalThis._graphifyBossStarted) {
    await globalThis._graphifyBoss.start();
    globalThis._graphifyBossStarted = true;
  }
  return globalThis._graphifyBoss;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'graph:build');
  if (auth.response) return auth.response;
  const { session } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = buildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rawSourceId, mode } = parsed.data;

  // Authorization: verify rawSourceId belongs to the session's workspace
  const [source] = await db
    .select({ workspaceId: rawSource.workspaceId })
    .from(rawSource)
    .where(eq(rawSource.id, rawSourceId))
    .limit(1);

  if (!source) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  if (source.workspaceId !== session.workspaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boss = await getBoss();
  const jobId = await boss.send('graphify-build', {
    rawSourceId,
    workspaceId: session.workspaceId,
    requestedBy: session.userId,
    mode: mode ?? 'standard',
  });

  return NextResponse.json(
    { jobId, message: 'Graphify build enqueued' },
    { status: 202 },
  );
}
