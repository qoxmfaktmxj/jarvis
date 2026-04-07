import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { attendance } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

const getQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM format').default(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }),
  userId: z.string().uuid().optional(),
});

const checkActionSchema = z.object({
  action: z.enum(['check-in', 'check-out']),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.ATTENDANCE_READ);
  if (auth.response) return auth.response;
  const session = auth.session;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = getQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { month, userId: requestedUserId } = parsed.data;

  // Only ATTENDANCE_ADMIN can query other users
  let targetUserId = session.userId;
  if (requestedUserId && requestedUserId !== session.userId) {
    if (!hasPermission(session, PERMISSIONS.ATTENDANCE_ADMIN)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = requestedUserId;
  }

  const parts = month.split('-');
  const year = Number(parts[0]);
  const mon = Number(parts[1]);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const endDate = new Date(year, mon, 0); // last day of the month
  const endDateStr = `${year}-${String(mon).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  const rows = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, session.workspaceId),
        eq(attendance.userId, targetUserId),
        gte(attendance.attendDate, startDate),
        lte(attendance.attendDate, endDateStr),
      ),
    )
    .orderBy(attendance.attendDate);

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.ATTENDANCE_WRITE);
  if (auth.response) return auth.response;
  const session = auth.session;

  const body = await request.json();
  const parsed = checkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action } = parsed.data;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0] ?? ''; // YYYY-MM-DD

  // Find today's record
  const [existing] = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, session.workspaceId),
        eq(attendance.userId, session.userId),
        eq(attendance.attendDate, todayStr),
      ),
    )
    .limit(1);

  if (action === 'check-in') {
    if (existing?.checkIn) {
      return NextResponse.json({ error: 'Already checked in today' }, { status: 409 });
    }

    const checkInTime = now;
    // Determine status based on check-in time (late if after 09:00)
    const hour = checkInTime.getHours();
    const minute = checkInTime.getMinutes();
    const isLate = hour > 9 || (hour === 9 && minute > 0);
    const status: string = isLate ? 'late' : 'present';

    if (existing) {
      const [updated] = await db
        .update(attendance)
        .set({ checkIn: checkInTime, status, updatedAt: now })
        .where(eq(attendance.id, existing.id))
        .returning();
      return NextResponse.json({ data: updated });
    }

    const [created] = await db
      .insert(attendance)
      .values({
        workspaceId: session.workspaceId,
        userId: session.userId,
        attendDate: todayStr,
        checkIn: checkInTime,
        status,
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  }

  // action === 'check-out'
  if (!existing?.checkIn) {
    return NextResponse.json({ error: 'Cannot check out before checking in' }, { status: 409 });
  }
  if (existing.checkOut) {
    return NextResponse.json({ error: 'Already checked out today' }, { status: 409 });
  }

  const [updated] = await db
    .update(attendance)
    .set({ checkOut: now, updatedAt: now })
    .where(eq(attendance.id, existing.id))
    .returning();

  return NextResponse.json({ data: updated });
}
