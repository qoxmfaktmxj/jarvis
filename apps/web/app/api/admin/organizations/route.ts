import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { organization } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, asc } from 'drizzle-orm';

type OrgRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: OrgRow[];
};

function buildTree(rows: OrgRow[], parentId: string | null = null): OrgRow[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({ ...r, children: buildTree(rows, r.id) }));
}

const createOrgSchema = z.object({
  code:      z.string().min(1).max(50),
  name:      z.string().min(1).max(200),
  parentId:  z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

const updateOrgSchema = createOrgSchema.partial().extend({ id: z.string().uuid() });

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const rows = await db
    .select({
      id:        organization.id,
      code:      organization.code,
      name:      organization.name,
      parentId:  organization.parentId,
      sortOrder: organization.sortOrder,
    })
    .from(organization)
    .where(eq(organization.workspaceId, session.workspaceId))
    .orderBy(asc(organization.sortOrder));

  const tree = buildTree(rows.map((r) => ({ ...r, children: [] })) as OrgRow[]);
  return NextResponse.json({ data: tree });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = createOrgSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(organization)
    .values({ ...parsed.data, workspaceId: session.workspaceId })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = updateOrgSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, ...data } = parsed.data;

  const [updated] = await db
    .update(organization)
    .set(data)
    .where(and(eq(organization.id, id), eq(organization.workspaceId, session.workspaceId)))
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

  // Check no children
  const children = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.workspaceId, session.workspaceId), eq(organization.parentId, id)))
    .limit(1);

  if (children.length > 0) {
    return NextResponse.json({ error: 'Cannot delete org with children' }, { status: 409 });
  }

  await db
    .delete(organization)
    .where(and(eq(organization.id, id), eq(organization.workspaceId, session.workspaceId)));

  return NextResponse.json({ success: true });
}
