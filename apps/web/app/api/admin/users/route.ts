import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { user, organization, userRole, role } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import {
  and, eq, ilike, or, desc, count, inArray, sql,
} from 'drizzle-orm';

// ── Schemas ──────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  employeeId: z.string().min(1).max(50),
  name:       z.string().min(1).max(200),
  email:      z.string().email().optional(),
  orgId:      z.string().uuid().optional(),
  roleCode:   z.enum(['ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER']).default('VIEWER'),
});

const updateUserSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string().min(1).max(200).optional(),
  email:     z.string().email().optional(),
  orgId:     z.string().uuid().nullable().optional(),
  isActive:  z.boolean().optional(),
  roleCodes: z.array(z.enum(['ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER'])).optional(),
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const page          = Math.max(1, Number(searchParams.get('page')  ?? '1'));
  const limit         = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset        = (page - 1) * limit;
  const q             = searchParams.get('q');
  const orgId         = searchParams.get('orgId');
  const isActiveParam = searchParams.get('isActive');

  const conditions = [eq(user.workspaceId, session.workspaceId)];

  if (q) {
    conditions.push(
      or(
        ilike(user.name, `%${q}%`),
        ilike(user.employeeId, `%${q}%`),
        ilike(user.email, `%${q}%`),
      )!,
    );
  }
  if (orgId) conditions.push(eq(user.orgId, orgId));
  if (isActiveParam !== null) conditions.push(eq(user.isActive, isActiveParam === 'true'));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:         user.id,
        employeeId: user.employeeId,
        name:       user.name,
        email:      user.email,
        isActive:   user.isActive,
        createdAt:  user.createdAt,
        orgId:      user.orgId,
        orgName:    organization.name,
        roles:      sql<string[]>`
          coalesce(
            array_agg(${role.code}) filter (where ${role.code} is not null),
            '{}'
          )
        `,
      })
      .from(user)
      .leftJoin(organization, eq(user.orgId, organization.id))
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(role, eq(role.id, userRole.roleId))
      .where(where)
      .groupBy(user.id, organization.id)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(user).where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return NextResponse.json({
    data: rows,
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
}

// ── POST /api/admin/users ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { roleCode, ...userData } = parsed.data;

  return await db.transaction(async (tx) => {
    // Check duplicate employeeId within workspace
    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.workspaceId, session.workspaceId), eq(user.employeeId, userData.employeeId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Employee ID already exists in workspace' }, { status: 409 });
    }

    const inserted = await tx
      .insert(user)
      .values({ ...userData, workspaceId: session.workspaceId })
      .returning();
    const newUser = inserted[0];
    if (!newUser) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Find or fallback to VIEWER role
    const roleRow = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.workspaceId, session.workspaceId), eq(role.code, roleCode)))
      .limit(1);

    if (roleRow.length > 0 && roleRow[0]) {
      await tx.insert(userRole).values({
        userId: newUser.id,
        roleId: roleRow[0].id,
      });
    }

    return NextResponse.json(newUser, { status: 201 });
  });
}

// ── PUT /api/admin/users ──────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, roleCodes, ...updateData } = parsed.data;

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(user.id, id), eq(user.workspaceId, session.workspaceId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (roleCodes !== undefined) {
      // Replace all roles
      await tx.delete(userRole).where(eq(userRole.userId, id));

      if (roleCodes.length > 0) {
        const roleRows = await tx
          .select({ id: role.id, code: role.code })
          .from(role)
          .where(and(eq(role.workspaceId, session.workspaceId), inArray(role.code, roleCodes)));

        if (roleRows.length > 0) {
          await tx.insert(userRole).values(
            roleRows.map((r) => ({ userId: id, roleId: r.id })),
          );
        }
      }
    }

    return NextResponse.json(updated);
  });
}

// ── DELETE /api/admin/users ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Soft delete — deactivate only
  const [updated] = await db
    .update(user)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(user.id, id), eq(user.workspaceId, session.workspaceId)))
    .returning({ id: user.id });

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
