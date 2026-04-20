import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const bodySchema = z.object({ id: z.string().uuid() });

// TODO(auth): real implementation when password hashing / email delivery lands.
export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id required (uuid)' }, { status: 400 });
  }

  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, parsed.data.id), eq(user.workspaceId, session.workspaceId)))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    message: 'Password reset stub — auth system pending',
  });
}
