import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { menuItem } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, asc } from 'drizzle-orm';

const updateMenuSchema = z.object({
  id:           z.string().uuid(),
  sortOrder:    z.number().int().optional(),
  isVisible:    z.boolean().optional(),
  requiredRole: z.string().max(50).nullable().optional(),
});

const bulkUpdateSchema = z.array(updateMenuSchema);

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const rows = await db
    .select()
    .from(menuItem)
    .where(eq(menuItem.workspaceId, session.workspaceId))
    .orderBy(asc(menuItem.sortOrder));

  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const createSchema = z.object({
    label:        z.string().min(1).max(200),
    icon:         z.string().optional(),
    routePath:    z.string().optional(),
    parentId:     z.string().uuid().nullable().optional(),
    sortOrder:    z.number().int().default(0),
    isVisible:    z.boolean().default(true),
    requiredRole: z.string().max(50).nullable().optional(),
  });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(menuItem)
    .values({ ...parsed.data, workspaceId: session.workspaceId })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

// Bulk update sortOrder / isVisible / requiredRole for all menu items
export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = bulkUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.transaction(async (tx) => {
    for (const item of parsed.data) {
      const { id, ...data } = item;
      await tx
        .update(menuItem)
        .set(data)
        .where(and(eq(menuItem.id, id), eq(menuItem.workspaceId, session.workspaceId)));
    }
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db
    .delete(menuItem)
    .where(and(eq(menuItem.id, id), eq(menuItem.workspaceId, session.workspaceId)));

  return NextResponse.json({ success: true });
}
