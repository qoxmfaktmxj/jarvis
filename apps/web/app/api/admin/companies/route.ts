import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { company } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, ilike, desc, count } from 'drizzle-orm';

const companySchema = z.object({
  code:           z.string().min(1).max(50),
  name:           z.string().min(1).max(300),
  groupCode:      z.string().max(50).optional(),
  category:       z.string().max(50).optional(),
  representative: z.string().max(100).optional(),
  address:        z.string().optional(),
  homepage:       z.string().max(500).optional(),
  industryCode:   z.string().max(50).optional(),
  startDate:      z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const page   = Math.max(1, Number(searchParams.get('page')  ?? '1'));
  const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;
  const q      = searchParams.get('q');

  const conditions = [eq(company.workspaceId, session.workspaceId)];
  if (q) conditions.push(ilike(company.name, `%${q}%`));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db.select().from(company).where(where).orderBy(desc(company.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(company).where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return NextResponse.json({
    data: rows,
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = companySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(company)
    .values({ ...parsed.data, workspaceId: session.workspaceId })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const updateSchema = companySchema.partial().extend({ id: z.string().uuid() });
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, ...data } = parsed.data;

  const [updated] = await db
    .update(company)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(company.id, id), eq(company.workspaceId, session.workspaceId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db.delete(company).where(and(eq(company.id, id), eq(company.workspaceId, session.workspaceId)));
  return NextResponse.json({ success: true });
}
