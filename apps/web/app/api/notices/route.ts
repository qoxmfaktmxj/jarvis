import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants';
import { createNoticeSchema } from '@jarvis/shared/validation';
import { createNotice, listNotices } from '@/lib/queries/notices';

function pickActorRole(roles: string[]): string {
  if (roles.includes('ADMIN')) return 'ADMIN';
  return roles[0] ?? 'VIEWER';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.NOTICE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20),
  );

  const { data, total } = await listNotices({
    workspaceId: session.workspaceId,
    page,
    limit,
    actorId: session.userId,
    actorRole: pickActorRole(session.roles),
  });

  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.NOTICE_CREATE);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json().catch(() => null);
  const parsed = createNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created = await createNotice(
    parsed.data,
    session.userId,
    session.workspaceId,
  );
  return NextResponse.json({ notice: created }, { status: 201 });
}
