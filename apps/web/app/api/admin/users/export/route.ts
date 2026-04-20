import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import {
  user, organization, userRole, role, codeGroup, codeItem,
} from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const statusEnum = z.enum(['active', 'inactive', 'locked']);

function escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDate(d: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function filenameNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `users-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const sp = req.nextUrl.searchParams;
  if (sp.get('format') !== 'csv') {
    return NextResponse.json({ error: 'format=csv required' }, { status: 400 });
  }

  const q = sp.get('q');
  const orgId = sp.get('orgId');
  const statusParam = sp.get('status');

  const conditions = [eq(user.workspaceId, session.workspaceId)];
  if (q) {
    conditions.push(or(
      ilike(user.name, `%${q}%`),
      ilike(user.employeeId, `%${q}%`),
      ilike(user.email, `%${q}%`),
    )!);
  }
  if (orgId) conditions.push(eq(user.orgId, orgId));
  if (statusParam && statusParam !== 'all') {
    const parsed = statusEnum.safeParse(statusParam);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    conditions.push(eq(user.status, parsed.data));
  }

  const rows = await db
    .select({
      employeeId:     user.employeeId,
      name:           user.name,
      email:          user.email,
      orgName:        organization.name,
      status:         user.status,
      position:       user.position,
      jobTitle:       user.jobTitle,
      isOutsourced:   user.isOutsourced,
      createdAt:      user.createdAt,
      roles:          sql<string[]>`
        coalesce(array_agg(distinct ${role.code}) filter (where ${role.code} is not null), '{}')
      `,
    })
    .from(user)
    .leftJoin(organization, eq(user.orgId, organization.id))
    .leftJoin(userRole, eq(userRole.userId, user.id))
    .leftJoin(role, eq(role.id, userRole.roleId))
    .where(and(...conditions))
    .groupBy(user.id, organization.id)
    .orderBy(desc(user.createdAt));

  // Resolve code labels in-memory (avoids double-alias ambiguity in SQL).
  const codeRows = await db
    .select({ groupCode: codeGroup.code, code: codeItem.code, label: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(eq(codeGroup.workspaceId, session.workspaceId))
    .orderBy(codeGroup.code, codeItem.code);
  const posMap = new Map<string, string>();
  const titleMap = new Map<string, string>();
  for (const c of codeRows) {
    if (c.groupCode === 'POSITION')  posMap.set(c.code, c.label);
    if (c.groupCode === 'JOB_TITLE') titleMap.set(c.code, c.label);
  }

  const statusLabel: Record<string, string> = { active: '활성', inactive: '비활성', locked: '잠금' };
  const header = '사번,이름,이메일,소속,직위,직책,역할,상태,외주여부,생성일';
  const body = rows.map((r) => [
    escape(r.employeeId),
    escape(r.name),
    escape(r.email ?? ''),
    escape(r.orgName ?? ''),
    escape(r.position ? (posMap.get(r.position) ?? r.position) : ''),
    escape(r.jobTitle ? (titleMap.get(r.jobTitle) ?? r.jobTitle) : ''),
    escape((r.roles as string[]).join('|')),
    escape(statusLabel[r.status as string] ?? r.status),
    escape(r.isOutsourced ? '예' : '아니오'),
    escape(formatDate(r.createdAt)),
  ].join(',')).join('\r\n');

  const csv = `\uFEFF${header}\r\n${body}\r\n`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameNow()}"`,
      'Cache-Control':       'no-store',
    },
  });
}
