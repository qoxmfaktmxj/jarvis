import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { auditLog, user } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, gte, lte, desc, count } from 'drizzle-orm';

// Read-only — no mutations on audit log

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const page         = Math.max(1, Number(searchParams.get('page')   ?? '1'));
  const limit        = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? '50')));
  const offset       = (page - 1) * limit;
  const userId       = searchParams.get('userId');
  const action       = searchParams.get('action');
  const resourceType = searchParams.get('resourceType');
  const dateFrom     = searchParams.get('dateFrom');
  const dateTo       = searchParams.get('dateTo');

  const conditions = [eq(auditLog.workspaceId, session.workspaceId)];
  if (userId)       conditions.push(eq(auditLog.userId, userId));
  if (action)       conditions.push(eq(auditLog.action, action));
  if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
  if (dateFrom)     conditions.push(gte(auditLog.createdAt, new Date(dateFrom)));
  if (dateTo)       conditions.push(lte(auditLog.createdAt, new Date(dateTo)));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:           auditLog.id,
        action:       auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId:   auditLog.resourceId,
        details:      auditLog.details,
        ipAddress:    auditLog.ipAddress,
        createdAt:    auditLog.createdAt,
        userId:       auditLog.userId,
        userName:     user.name,
        employeeId:   user.employeeId,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return NextResponse.json({
    data: rows,
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
}
