import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants';
import { updateNoticeSchema } from '@jarvis/shared/validation';
import {
  deleteNotice,
  getNoticeById,
  updateNotice,
} from '@/lib/queries/notices';

function pickActorRole(roles: string[]): string {
  if (roles.includes('ADMIN')) return 'ADMIN';
  return roles[0] ?? 'VIEWER';
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.NOTICE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await ctx.params;
  const found = await getNoticeById(id, session.workspaceId);
  if (!found) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // sensitivity: INTERNAL은 동일 workspace 멤버만 — 이미 workspaceId 매칭으로 보장됨.
  // PUBLIC도 현재 모델에선 workspace-scoped로 노출.
  return NextResponse.json({ notice: found });
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.NOTICE_UPDATE);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateNotice(
      id,
      parsed.data,
      { id: session.userId, role: pickActorRole(session.roles) },
      session.workspaceId,
    );
    revalidatePath('/notices');
    revalidatePath(`/notices/${id}`);
    return NextResponse.json({ notice: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Notice not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.NOTICE_DELETE);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await ctx.params;
  try {
    await deleteNotice(
      id,
      { id: session.userId, role: pickActorRole(session.roles) },
      session.workspaceId,
    );
    revalidatePath('/notices');
    revalidatePath(`/notices/${id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw err;
  }
}
