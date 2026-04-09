// apps/web/app/api/graphify/build/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/server/api-auth';
import PgBoss from 'pg-boss';

const buildSchema = z.object({
  rawSourceId: z.string().uuid(),
  mode: z.enum(['standard', 'deep']).optional(),
});

// Module-level PgBoss singleton for job enqueue (web server side)
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
  const auth = await requireApiSession(req, 'knowledge:create');
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
