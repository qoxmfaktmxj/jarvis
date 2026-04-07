import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { outManage, outManageDetail } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc, count, inArray } from 'drizzle-orm';
import { z } from 'zod';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

const createSchema = z.object({
  outDate: z.string().date(),
  outType: z.enum(['client-visit', 'errand', 'remote', 'training', 'other']),
  destination: z.string().max(500).optional(),
  purpose: z.string().min(1).max(2000),
  companyId: z.string().uuid().optional(),
  details: z
    .array(
      z.object({
        timeFrom: z.string().datetime({ offset: true }),
        timeTo: z.string().datetime({ offset: true }),
        activity: z.string().max(500).optional(),
      }),
    )
    .min(1, 'At least one time block is required'),
});

const approveSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.ATTENDANCE_READ);
  if (auth.response) return auth.response;
  const session = auth.session;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { page, limit, status } = parsed.data;
  const offset = (page - 1) * limit;
  const isAdmin = hasPermission(session, PERMISSIONS.ATTENDANCE_ADMIN);

  const conditions = [eq(outManage.workspaceId, session.workspaceId)];
  if (!isAdmin) {
    conditions.push(eq(outManage.userId, session.userId));
  }
  if (status) {
    conditions.push(eq(outManage.status, status));
  }

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(outManage)
      .where(where)
      .orderBy(desc(outManage.outDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(outManage).where(where),
  ]);
  const total = countResult[0]?.total ?? 0;

  // Fetch details for all returned records in one query
  const detailsMap: Record<string, typeof outManageDetail.$inferSelect[]> = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const details = await db
      .select()
      .from(outManageDetail)
      .where(inArray(outManageDetail.outManageId, ids))
      .orderBy(outManageDetail.timeFrom);
    for (const d of details) {
      if (!detailsMap[d.outManageId]) detailsMap[d.outManageId] = [];
      detailsMap[d.outManageId]!.push(d);
    }
  }

  const data = rows.map((r) => ({ ...r, details: detailsMap[r.id] ?? [] }));

  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total: Number(total ?? 0),
      totalPages: Math.ceil(Number(total ?? 0) / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.ATTENDANCE_WRITE);
  if (auth.response) return auth.response;
  const session = auth.session;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { outDate, outType, destination, purpose, companyId, details } = parsed.data;

  // Validate time blocks: timeTo must be after timeFrom
  for (const d of details) {
    if (new Date(d.timeTo) <= new Date(d.timeFrom)) {
      return NextResponse.json(
        { error: 'Each time block timeTo must be after timeFrom' },
        { status: 400 },
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(outManage)
      .values({
        workspaceId: session.workspaceId,
        userId: session.userId,
        outDate,
        outType,
        destination: destination ?? null,
        purpose,
        companyId: companyId ?? null,
        status: 'pending',
      })
      .returning();
    const record = inserted[0]!;

    const detailRows = await tx
      .insert(outManageDetail)
      .values(
        details.map((d) => ({
          outManageId: record.id,
          workspaceId: session.workspaceId,
          timeFrom: new Date(d.timeFrom),
          timeTo: new Date(d.timeTo),
          activity: d.activity ?? null,
        })),
      )
      .returning();

    return { ...record, details: detailRows };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.ATTENDANCE_ADMIN);
  if (auth.response) return auth.response;
  const session = auth.session;

  const body = await request.json();
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, action } = parsed.data;

  const [existing] = await db
    .select()
    .from(outManage)
    .where(and(eq(outManage.id, id), eq(outManage.workspaceId, session.workspaceId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Request is already ${existing.status}` },
      { status: 409 },
    );
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const [updated] = await db
    .update(outManage)
    .set({
      status: newStatus,
      approvedBy: session.userId,
      updatedAt: new Date(),
    })
    .where(eq(outManage.id, id))
    .returning();

  return NextResponse.json({ data: updated });
}
