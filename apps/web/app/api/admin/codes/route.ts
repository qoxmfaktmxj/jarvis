import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { codeGroup, codeItem } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, asc, inArray } from 'drizzle-orm';

const createItemSchema = z.object({
  groupId:   z.string().uuid(),
  code:      z.string().min(1).max(50),
  name:      z.string().min(1).max(200),
  nameEn:    z.string().max(200).optional(),
  sortOrder: z.number().int().default(0),
  isActive:  z.boolean().default(true),
  metadata:  z.record(z.unknown()).optional(),
});

const updateItemSchema = createItemSchema.partial().extend({ id: z.string().uuid() });

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const groupIdParam = req.nextUrl.searchParams.get('groupId');

  const groups = await db
    .select()
    .from(codeGroup)
    .where(eq(codeGroup.workspaceId, session.workspaceId))
    .orderBy(asc(codeGroup.code));

  const items = await db
    .select()
    .from(codeItem)
    .where(
      groupIdParam
        ? eq(codeItem.groupId, groupIdParam)
        : undefined,
    )
    .orderBy(asc(codeItem.sortOrder));

  // Attach items to groups
  const result = groups.map((g) => ({
    ...g,
    items: items.filter((i) => i.groupId === g.id),
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = createItemSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // P1 #9 — PUT/DELETE 와 동일하게 codeGroup 의 워크스페이스 소속을 검증한다.
  // 이전엔 ADMIN_ALL 게이트만 있고 본문의 groupId 가 다른 워크스페이스의 group 일
  // 가능성을 차단하지 않았음 (cross-workspace insert).
  const [ownerGroup] = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(and(eq(codeGroup.id, parsed.data.groupId), eq(codeGroup.workspaceId, session.workspaceId)))
    .limit(1);
  if (!ownerGroup) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [created] = await db.insert(codeItem).values(parsed.data).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = updateItemSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, ...data } = parsed.data;

  // Verify the codeItem belongs to this workspace via codeGroup FK
  const ownerGroups = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(eq(codeGroup.workspaceId, session.workspaceId));
  const groupIds = ownerGroups.map((g) => g.id);

  const [updated] = await db
    .update(codeItem)
    .set(data)
    .where(and(eq(codeItem.id, id), inArray(codeItem.groupId, groupIds)))
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

  // Verify the codeItem belongs to this workspace via codeGroup FK
  const ownerGroups = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(eq(codeGroup.workspaceId, session.workspaceId));
  const groupIds = ownerGroups.map((g) => g.id);

  await db.delete(codeItem).where(and(eq(codeItem.id, id), inArray(codeItem.groupId, groupIds)));
  return NextResponse.json({ success: true });
}
