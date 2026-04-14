# Jarvis Plan 08: Attendance & HR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement attendance tracking (check-in/out, monthly view) and out-of-office management (request, approve, time detail tracking).

**Architecture:** Attendance page shows monthly calendar + table. Check-in/out is a client component with Server Action. Out-manage list is a Server Component with client-side dialog for creating requests. Manager approval uses RBAC check server-side.

**Tech Stack:** Next.js 15 Server Components + Server Actions, TanStack Table, React Hook Form 7, Zod 3, Drizzle ORM, shadcn/ui (Calendar, Table, Dialog, Select, Badge), Vitest, Playwright

**Prerequisites:** Plan 01 Foundation complete.

---

## File Map

```
apps/web/app/(app)/attendance/
├── page.tsx                                      CREATE
└── out-manage/page.tsx                           CREATE
apps/web/app/api/attendance/
├── route.ts                                      CREATE
└── out-manage/route.ts                           CREATE
apps/web/components/attendance/
├── AttendanceCalendar.tsx                        CREATE (monthly calendar view)
├── AttendanceTable.tsx                           CREATE (TanStack Table)
├── CheckInButton.tsx                             CREATE (client component)
├── OutManageForm.tsx                             CREATE (React Hook Form + Zod)
├── OutManageTable.tsx                            CREATE
└── TimeDetailSheet.tsx                           CREATE (time blocks for a day)
apps/web/lib/queries/attendance.ts                CREATE
```

---

## Task 1: Attendance API — get + check-in/out

**Files:**
- Create: `apps/web/app/api/attendance/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/attendance/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { attendance } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
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
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const [year, mon] = month.split('-').map(Number);
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
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_WRITE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = checkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action } = parsed.data;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

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
    const status = isLate ? 'late' : 'present';

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
```

- [ ] **Step 2: Write Vitest tests**

Create `apps/web/app/api/attendance/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockResolvedValue([]),
  limit: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
};

vi.mock('@jarvis/db/client', () => ({ db: mockDb }));
vi.mock('@jarvis/auth/session', () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    role: 'member',
  }),
}));
vi.mock('@jarvis/auth/rbac', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

describe('GET /api/attendance', () => {
  it('returns 401 when no session', async () => {
    const { getSession } = await import('@jarvis/auth/session');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/attendance');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid month format', async () => {
    const req = new NextRequest('http://localhost/api/attendance?month=not-a-month');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 403 when requesting another user without ATTENDANCE_ADMIN', async () => {
    const { hasPermission } = await import('@jarvis/auth/rbac');
    vi.mocked(hasPermission)
      .mockReturnValueOnce(true)  // ATTENDANCE_READ passes
      .mockReturnValueOnce(false); // ATTENDANCE_ADMIN fails
    const req = new NextRequest(
      'http://localhost/api/attendance?month=2026-04&userId=other-user-uuid-1234',
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('returns attendance records for the month', async () => {
    const mockRecords = [
      { id: 'a1', attendDate: '2026-04-01', status: 'present', checkIn: null, checkOut: null },
    ];
    const chainMock = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRecords),
    };
    vi.mocked(mockDb.select).mockReturnValueOnce(chainMock as any);
    const req = new NextRequest('http://localhost/api/attendance?month=2026-04');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

describe('POST /api/attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { hasPermission } = require('@jarvis/auth/rbac');
    vi.mocked(hasPermission).mockReturnValue(true);
  });

  it('returns 400 for invalid action', async () => {
    const req = new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ action: 'invalid-action' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 when checking in twice', async () => {
    const chainMock = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: 'a1', checkIn: new Date(), checkOut: null },
      ]),
    };
    vi.mocked(mockDb.select).mockReturnValueOnce(chainMock as any);
    const req = new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ action: 'check-in' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('returns 409 when checking out without check-in', async () => {
    const chainMock = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'a1', checkIn: null, checkOut: null }]),
    };
    vi.mocked(mockDb.select).mockReturnValueOnce(chainMock as any);
    const req = new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ action: 'check-out' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('creates a new attendance record on first check-in', async () => {
    const noRecordChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(mockDb.select).mockReturnValueOnce(noRecordChain as any);
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-1', checkIn: new Date(), status: 'present' }]),
    };
    vi.mocked(mockDb.insert).mockReturnValueOnce(insertChain as any);
    const req = new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ action: 'check-in' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toHaveProperty('id', 'new-1');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter=web test apps/web/app/api/attendance/route.test.ts
```

---

## Task 2: Out-manage API

**Files:**
- Create: `apps/web/app/api/attendance/out-manage/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/attendance/out-manage/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { outManage, outManageDetail, user } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
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
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(outManage)
      .where(where)
      .orderBy(desc(outManage.outDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(outManage).where(where),
  ]);

  // Fetch details for all returned records in one query
  let detailsMap: Record<string, typeof outManageDetail.$inferSelect[]> = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const details = await db
      .select()
      .from(outManageDetail)
      .where(inArray(outManageDetail.outManageId, ids))
      .orderBy(outManageDetail.timeFrom);
    for (const d of details) {
      if (!detailsMap[d.outManageId]) detailsMap[d.outManageId] = [];
      detailsMap[d.outManageId].push(d);
    }
  }

  const data = rows.map((r) => ({ ...r, details: detailsMap[r.id] ?? [] }));

  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_WRITE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
    const [record] = await tx
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
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only managers / admins can approve or reject
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden: manager role required' }, { status: 403 });
  }

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
```

- [ ] **Step 2: Write Vitest tests**

Create `apps/web/app/api/attendance/out-manage/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PUT } from './route';
import { NextRequest } from 'next/server';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));
vi.mock('@jarvis/auth/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', workspaceId: 'ws1', role: 'manager' }),
}));
vi.mock('@jarvis/auth/rbac', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

describe('GET /api/attendance/out-manage', () => {
  it('returns 401 with no session', async () => {
    const { getSession } = await import('@jarvis/auth/session');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/attendance/out-manage');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns paginated list with details', async () => {
    const rows = [{ id: 'om1', outDate: '2026-04-10', status: 'pending' }];
    const detailRows = [{ id: 'd1', outManageId: 'om1', timeFrom: new Date(), timeTo: new Date() }];
    // First select: rows; second select: count; third select: details
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(rows),
      } as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      } as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(detailRows),
      } as any);

    const req = new NextRequest('http://localhost/api/attendance/out-manage');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].details).toHaveLength(1);
    expect(json.meta.total).toBe(1);
  });
});

describe('POST /api/attendance/out-manage', () => {
  it('returns 400 for missing details array', async () => {
    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'POST',
      body: JSON.stringify({
        outDate: '2026-04-10',
        outType: 'errand',
        purpose: 'Bank errand',
        details: [],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when timeTo is before timeFrom', async () => {
    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'POST',
      body: JSON.stringify({
        outDate: '2026-04-10',
        outType: 'errand',
        purpose: 'Bank errand',
        details: [
          {
            timeFrom: '2026-04-10T14:00:00+09:00',
            timeTo: '2026-04-10T13:00:00+09:00',
            activity: 'Banking',
          },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('creates record and details in transaction', async () => {
    const createdRecord = { id: 'om2', outDate: '2026-04-10', status: 'pending' };
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      const txMock = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnThis(),
          returning: vi.fn()
            .mockResolvedValueOnce([createdRecord])
            .mockResolvedValueOnce([{ id: 'd2', outManageId: 'om2' }]),
        }),
      };
      return fn(txMock);
    });

    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'POST',
      body: JSON.stringify({
        outDate: '2026-04-10',
        outType: 'errand',
        purpose: 'Bank errand',
        details: [
          {
            timeFrom: '2026-04-10T10:00:00+09:00',
            timeTo: '2026-04-10T12:00:00+09:00',
            activity: 'Banking',
          },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/attendance/out-manage', () => {
  it('returns 403 for non-manager', async () => {
    const { hasPermission } = await import('@jarvis/auth/rbac');
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'PUT',
      body: JSON.stringify({ id: 'om1', action: 'approve' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('returns 409 when already approved', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'om1', status: 'approved' }]),
    } as any);
    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'PUT',
      body: JSON.stringify({ id: 'om1', action: 'approve' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(409);
  });

  it('approves a pending request', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'om1', status: 'pending' }]),
    } as any);
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'om1', status: 'approved' }]),
    } as any);
    const req = new NextRequest('http://localhost/api/attendance/out-manage', {
      method: 'PUT',
      body: JSON.stringify({ id: 'om1', action: 'approve' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('approved');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter=web test apps/web/app/api/attendance/out-manage/route.test.ts
```

---

## Task 3: Data queries

**Files:**
- Create: `apps/web/lib/queries/attendance.ts`

- [ ] **Step 1: Create `apps/web/lib/queries/attendance.ts`**

```typescript
import { db } from '@jarvis/db/client';
import { attendance, outManage, outManageDetail } from '@jarvis/db/schema';
import { and, eq, gte, lte, desc, count, inArray } from 'drizzle-orm';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttendanceRecord = typeof attendance.$inferSelect;

export type TimeDetail = typeof outManageDetail.$inferSelect;

export type OutManageRecord = typeof outManage.$inferSelect & {
  details: TimeDetail[];
};

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OutManageFilters {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
  /** When true, returns records for all users in the workspace */
  allUsers?: boolean;
  userId?: string;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns all attendance records for a user in a given month.
 * @param month - YYYY-MM format, e.g. '2026-04'
 */
export async function getMonthlyAttendance(
  workspaceId: string,
  userId: string,
  month: string,
): Promise<AttendanceRecord[]> {
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.workspaceId, workspaceId),
        eq(attendance.userId, userId),
        gte(attendance.attendDate, startDate),
        lte(attendance.attendDate, endDate),
      ),
    )
    .orderBy(attendance.attendDate);
}

/**
 * Returns a paginated list of out-manage requests.
 * When filters.allUsers is true, returns all users in the workspace (admin view).
 */
export async function getOutManageList(
  workspaceId: string,
  userId: string,
  filters: OutManageFilters = {},
): Promise<PaginatedResponse<OutManageRecord>> {
  const { page = 1, limit = 20, status, allUsers = false } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(outManage.workspaceId, workspaceId)];
  if (!allUsers) {
    conditions.push(eq(outManage.userId, userId));
  }
  if (status) {
    conditions.push(eq(outManage.status, status));
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(outManage)
      .where(where)
      .orderBy(desc(outManage.outDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(outManage).where(where),
  ]);

  let detailsMap: Record<string, TimeDetail[]> = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const details = await db
      .select()
      .from(outManageDetail)
      .where(inArray(outManageDetail.outManageId, ids))
      .orderBy(outManageDetail.timeFrom);
    for (const d of details) {
      if (!detailsMap[d.outManageId]) detailsMap[d.outManageId] = [];
      detailsMap[d.outManageId].push(d);
    }
  }

  const data: OutManageRecord[] = rows.map((r) => ({
    ...r,
    details: detailsMap[r.id] ?? [],
  }));

  return {
    data,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}

/**
 * Returns a single out-manage record with all its time detail blocks.
 */
export async function getOutManageDetail(
  outManageId: string,
  workspaceId: string,
): Promise<OutManageRecord | null> {
  const [record] = await db
    .select()
    .from(outManage)
    .where(
      and(eq(outManage.id, outManageId), eq(outManage.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!record) return null;

  const details = await db
    .select()
    .from(outManageDetail)
    .where(eq(outManageDetail.outManageId, outManageId))
    .orderBy(outManageDetail.timeFrom);

  return { ...record, details };
}
```

---

## Task 4: AttendanceCalendar + CheckInButton

**Files:**
- Create: `apps/web/components/attendance/AttendanceCalendar.tsx`
- Create: `apps/web/components/attendance/CheckInButton.tsx`

- [ ] **Step 1: Create `apps/web/components/attendance/AttendanceCalendar.tsx`**

```typescript
'use client';

import * as React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/lib/queries/attendance';
import { format, parseISO } from 'date-fns';

type StatusColor = {
  bg: string;
  dot: string;
  label: string;
};

const STATUS_COLORS: Record<string, StatusColor> = {
  present: { bg: 'bg-green-100 dark:bg-green-900/30', dot: 'bg-green-500', label: 'Present' },
  late:    { bg: 'bg-yellow-100 dark:bg-yellow-900/30', dot: 'bg-yellow-500', label: 'Late' },
  absent:  { bg: 'bg-red-100 dark:bg-red-900/30', dot: 'bg-red-500', label: 'Absent' },
  remote:  { bg: 'bg-blue-100 dark:bg-blue-900/30', dot: 'bg-blue-500', label: 'Remote' },
  'half-day': { bg: 'bg-purple-100 dark:bg-purple-900/30', dot: 'bg-purple-500', label: 'Half-day' },
};

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  month: string; // YYYY-MM
}

function formatTime(ts: Date | string | null): string {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return format(d, 'HH:mm');
}

function formatDuration(checkIn: Date | string | null, checkOut: Date | string | null): string {
  if (!checkIn || !checkOut) return '—';
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  const diffMin = Math.round((outMs - inMs) / 60000);
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m`;
}

export function AttendanceCalendar({ records, month }: AttendanceCalendarProps) {
  const [year, mon] = month.split('-').map(Number);
  const displayMonth = new Date(year, mon - 1, 1);

  // Build a map: dateStr (YYYY-MM-DD) -> record
  const recordMap = React.useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    for (const r of records) {
      map[r.attendDate] = r;
    }
    return map;
  }, [records]);

  const modifiers = React.useMemo(() => {
    const mod: Record<string, Date[]> = {
      present: [],
      late: [],
      absent: [],
      remote: [],
      'half-day': [],
    };
    for (const r of records) {
      const status = r.status ?? 'present';
      if (mod[status]) {
        mod[status].push(parseISO(r.attendDate));
      }
    }
    return mod;
  }, [records]);

  const modifiersClassNames = {
    present: 'rdp-day_present',
    late: 'rdp-day_late',
    absent: 'rdp-day_absent',
    remote: 'rdp-day_remote',
    'half-day': 'rdp-day_halfday',
  };

  function DayContent({ date }: { date: Date }) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const record = recordMap[dateStr];
    const status = record?.status ?? null;
    const colors = status ? STATUS_COLORS[status] : null;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'relative flex h-full w-full flex-col items-center justify-start rounded-md pt-1',
              colors?.bg,
              record && 'cursor-pointer',
            )}
          >
            <span className="text-sm font-medium leading-none">{date.getDate()}</span>
            {colors && (
              <span
                className={cn('mt-1 h-1.5 w-1.5 rounded-full', colors.dot)}
                aria-hidden="true"
              />
            )}
          </div>
        </PopoverTrigger>
        {record && (
          <PopoverContent className="w-56 p-3" side="bottom" align="center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 rounded-full', colors?.dot ?? 'bg-gray-400')}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold">
                  {colors?.label ?? record.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                <span>Check-in</span>
                <span className="font-medium text-foreground">
                  {formatTime(record.checkIn)}
                </span>
                <span>Check-out</span>
                <span className="font-medium text-foreground">
                  {formatTime(record.checkOut)}
                </span>
                <span>Duration</span>
                <span className="font-medium text-foreground">
                  {formatDuration(record.checkIn, record.checkOut)}
                </span>
              </div>
              {record.note && (
                <p className="text-xs text-muted-foreground border-t pt-1 mt-1">{record.note}</p>
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <Calendar
        mode="single"
        month={displayMonth}
        onMonthChange={() => {}}
        components={{ Day: ({ date, displayMonth: dm }) => {
          if (date.getMonth() !== dm.getMonth()) return <div />;
          return <DayContent date={date} />;
        }}}
        classNames={{
          months: 'flex flex-col sm:flex-row gap-4',
          month: 'space-y-4 w-full',
          table: 'w-full border-collapse',
          head_row: 'flex',
          head_cell: 'text-muted-foreground rounded-md w-full font-normal text-xs',
          row: 'flex w-full mt-2',
          cell: cn(
            'relative h-16 w-full p-0 text-center text-sm focus-within:relative focus-within:z-20',
            '[&:has([aria-selected])]:bg-accent',
          ),
          day: 'h-full w-full p-0 font-normal',
          day_outside: 'opacity-30',
          day_disabled: 'text-muted-foreground opacity-50',
        }}
      />
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(STATUS_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-2.5 w-2.5 rounded-full', val.dot)} />
            {val.label}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/attendance/CheckInButton.tsx`**

```typescript
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/lib/queries/attendance';

interface CheckInButtonProps {
  todayRecord: AttendanceRecord | null;
}

export function CheckInButton({ todayRecord }: CheckInButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState<string>('');
  const [hovered, setHovered] = React.useState(false);

  React.useEffect(() => {
    const tick = () => setCurrentTime(format(new Date(), 'HH:mm:ss'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const hasCheckedIn = Boolean(todayRecord?.checkIn);
  const hasCheckedOut = Boolean(todayRecord?.checkOut);
  const action: 'check-in' | 'check-out' | null = !hasCheckedIn
    ? 'check-in'
    : !hasCheckedOut
    ? 'check-out'
    : null;

  async function handleClick() {
    if (!action || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Failed to record attendance');
        return;
      }
      router.refresh();
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!action) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>Checked out at {format(new Date(todayRecord!.checkOut!), 'HH:mm')}</span>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      variant={action === 'check-in' ? 'default' : 'secondary'}
      onClick={handleClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('gap-2 min-w-36', action === 'check-in' && 'bg-green-600 hover:bg-green-700')}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : action === 'check-in' ? (
        <LogIn className="h-4 w-4" aria-hidden="true" />
      ) : (
        <LogOut className="h-4 w-4" aria-hidden="true" />
      )}
      {hovered ? currentTime : action === 'check-in' ? 'Check In' : 'Check Out'}
    </Button>
  );
}
```

---

## Task 5: AttendanceTable

**Files:**
- Create: `apps/web/components/attendance/AttendanceTable.tsx`

- [ ] **Step 1: Create `apps/web/components/attendance/AttendanceTable.tsx`**

```typescript
'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/lib/queries/attendance';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  present:  { variant: 'default',     label: 'Present' },
  late:     { variant: 'outline',     label: 'Late' },
  absent:   { variant: 'destructive', label: 'Absent' },
  remote:   { variant: 'secondary',   label: 'Remote' },
  'half-day': { variant: 'outline',   label: 'Half-day' },
};

function formatTime(ts: Date | string | null): string {
  if (!ts) return '—';
  return format(new Date(ts), 'HH:mm');
}

function formatDuration(checkIn: Date | string | null, checkOut: Date | string | null): string {
  if (!checkIn || !checkOut) return '—';
  const diffMin = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000,
  );
  if (diffMin < 0) return '—';
  return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
}

const helper = createColumnHelper<AttendanceRecord>();

const columns = [
  helper.accessor('attendDate', {
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Date
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = getValue();
      return <span className="font-medium tabular-nums">{format(parseISO(v), 'MM/dd (EEE)')}</span>;
    },
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() ?? 'present';
      const cfg = STATUS_BADGE[s] ?? { variant: 'secondary' as const, label: s };
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
    enableSorting: false,
  }),
  helper.accessor('checkIn', {
    header: 'Check-in',
    cell: ({ getValue }) => <span className="tabular-nums">{formatTime(getValue())}</span>,
    enableSorting: false,
  }),
  helper.accessor('checkOut', {
    header: 'Check-out',
    cell: ({ getValue }) => <span className="tabular-nums">{formatTime(getValue())}</span>,
    enableSorting: false,
  }),
  helper.display({
    id: 'duration',
    header: 'Duration',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDuration(row.original.checkIn, row.original.checkOut)}
      </span>
    ),
  }),
  helper.accessor('note', {
    header: 'Note',
    cell: ({ getValue }) => {
      const v = getValue();
      return v ? (
        <span className="max-w-[180px] truncate text-sm text-muted-foreground" title={v}>{v}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      );
    },
    enableSorting: false,
  }),
];

interface AttendanceTableProps {
  records: AttendanceRecord[];
  month: string; // YYYY-MM
}

export function AttendanceTable({ records, month }: AttendanceTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'attendDate', desc: false }]);

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function navigate(direction: 'prev' | 'next') {
    const [year, mon] = month.split('-').map(Number);
    const d = new Date(year, mon - 1 + (direction === 'next' ? 1 : -1), 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`${pathname}?${params.toString()}`);
  }

  const [displayYear, displayMon] = month.split('-').map(Number);
  const monthLabel = new Date(displayYear, displayMon - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigate('prev')} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
        <Button variant="outline" size="icon" onClick={() => navigate('next')} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No attendance records for this month.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

---

## Task 6: OutManageForm + OutManageTable + TimeDetailSheet

**Files:**
- Create: `apps/web/components/attendance/OutManageForm.tsx`
- Create: `apps/web/components/attendance/OutManageTable.tsx`
- Create: `apps/web/components/attendance/TimeDetailSheet.tsx`

- [ ] **Step 1: Create `apps/web/components/attendance/OutManageForm.tsx`**

```typescript
'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const timeDetailSchema = z.object({
  timeFrom: z.string().min(1, 'Required'),
  timeTo: z.string().min(1, 'Required'),
  activity: z.string().max(500).optional(),
});

const formSchema = z.object({
  outDate: z.string().date('Must be a valid date (YYYY-MM-DD)'),
  outType: z.enum(['client-visit', 'errand', 'remote', 'training', 'other']),
  destination: z.string().max(500).optional(),
  purpose: z.string().min(1, 'Purpose is required').max(2000),
  companyId: z.string().uuid('Must be a valid UUID').optional().or(z.literal('')),
  details: z
    .array(timeDetailSchema)
    .min(1, 'At least one time block is required'),
});

type FormValues = z.infer<typeof formSchema>;

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

interface OutManageFormProps {
  children: React.ReactNode; // trigger element
}

export function OutManageForm({ children }: OutManageFormProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      outDate: today,
      outType: 'errand',
      destination: '',
      purpose: '',
      companyId: '',
      details: [{ timeFrom: '', timeTo: '', activity: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'details',
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // Convert local datetime-local inputs (YYYY-MM-DDTHH:mm) to ISO strings
      const payload = {
        ...values,
        companyId: values.companyId || undefined,
        details: values.details.map((d) => ({
          timeFrom: new Date(d.timeFrom).toISOString(),
          timeTo: new Date(d.timeTo).toISOString(),
          activity: d.activity || undefined,
        })),
      };
      const res = await fetch('/api/attendance/out-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        form.setError('root', { message: err.error?.formErrors?.[0] ?? 'Submission failed' });
        return;
      }
      setOpen(false);
      form.reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Out-of-Office Request</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="outDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(OUT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Client HQ, City Hall" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Describe the purpose of this out-of-office..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time blocks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Time Blocks</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ timeFrom: '', timeTo: '', activity: '' })}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Block
                </Button>
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`details.${i}.timeFrom`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">From</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`details.${i}.timeTo`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">To</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <FormField
                      control={form.control}
                      name={`details.${i}.activity`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="text-xs">Activity <span className="text-muted-foreground">(optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Contract negotiation" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mb-0.5 text-destructive hover:text-destructive"
                        onClick={() => remove(i)}
                        aria-label="Remove time block"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {form.formState.errors.details?.root && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.details.root.message}
                </p>
              )}
            </div>

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/attendance/OutManageTable.tsx`**

```typescript
'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, CheckCircle2, XCircle, ArrowUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import type { OutManageRecord } from '@/lib/queries/attendance';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending:  { variant: 'outline',     label: 'Pending' },
  approved: { variant: 'default',     label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

interface OutManageTableProps {
  records: OutManageRecord[];
  isManager?: boolean;
  onViewDetails: (record: OutManageRecord) => void;
}

export function OutManageTable({ records, isManager = false, onViewDetails }: OutManageTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'outDate', desc: true }]);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  async function handleApproval(id: string, action: 'approve' | 'reject') {
    setActionLoading(id + action);
    try {
      const res = await fetch('/api/attendance/out-manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Action failed');
        return;
      }
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  const helper = createColumnHelper<OutManageRecord>();

  const columns = React.useMemo(
    () => [
      helper.accessor('outDate', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">
            {format(parseISO(getValue()), 'yyyy-MM-dd')}
          </span>
        ),
      }),
      helper.accessor('outType', {
        header: 'Type',
        cell: ({ getValue }) => (
          <span>{OUT_TYPE_LABELS[getValue()] ?? getValue()}</span>
        ),
        enableSorting: false,
      }),
      helper.accessor('destination', {
        header: 'Destination',
        cell: ({ getValue }) => {
          const v = getValue();
          return v ? (
            <span className="max-w-[160px] truncate" title={v}>{v}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          );
        },
        enableSorting: false,
      }),
      helper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => {
          const s = getValue() ?? 'pending';
          const cfg = STATUS_BADGE[s] ?? { variant: 'secondary' as const, label: s };
          return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
        },
        enableSorting: false,
      }),
      helper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="View details"
                onClick={() => onViewDetails(r)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {isManager && r.status === 'pending' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Approve"
                    className="text-green-600 hover:text-green-700"
                    disabled={actionLoading !== null}
                    onClick={() => handleApproval(r.id, 'approve')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Reject"
                    className="text-destructive hover:text-destructive"
                    disabled={actionLoading !== null}
                    onClick={() => handleApproval(r.id, 'reject')}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      }),
    ],
    [isManager, actionLoading, onViewDetails],
  );

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No out-of-office requests found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/attendance/TimeDetailSheet.tsx`**

```typescript
'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { OutManageRecord } from '@/lib/queries/attendance';

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending:  { variant: 'outline',     label: 'Pending' },
  approved: { variant: 'default',     label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

interface TimeDetailSheetProps {
  record: OutManageRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TimeDetailSheet({ record, open, onOpenChange }: TimeDetailSheetProps) {
  if (!record) return null;

  const statusCfg = STATUS_BADGE[record.status ?? 'pending'] ?? { variant: 'secondary' as const, label: record.status };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle>Out-of-Office Details</SheetTitle>
          <SheetDescription>
            {format(new Date(record.outDate), 'MMMM d, yyyy')} &mdash;{' '}
            {OUT_TYPE_LABELS[record.outType] ?? record.outType}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>

            <span className="text-muted-foreground">Destination</span>
            <span>{record.destination || '—'}</span>

            <span className="text-muted-foreground">Purpose</span>
            <span className="whitespace-pre-wrap">{record.purpose}</span>
          </div>

          {/* Time blocks */}
          {record.details.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Time Blocks</h4>
              <div className="space-y-2">
                {record.details.map((d, i) => (
                  <div
                    key={d.id}
                    className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium tabular-nums">
                        {format(new Date(d.timeFrom), 'HH:mm')}
                        {' – '}
                        {format(new Date(d.timeTo), 'HH:mm')}
                      </span>
                      <span className="text-xs text-muted-foreground">Block {i + 1}</span>
                    </div>
                    {d.activity && (
                      <p className="text-muted-foreground">{d.activity}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## Task 7: Attendance pages

**Files:**
- Create: `apps/web/app/(app)/attendance/page.tsx`
- Create: `apps/web/app/(app)/attendance/out-manage/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(app)/attendance/page.tsx`**

```typescript
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getMonthlyAttendance } from '@/lib/queries/attendance';
import { AttendanceCalendar } from '@/components/attendance/AttendanceCalendar';
import { AttendanceTable } from '@/components/attendance/AttendanceTable';
import { CheckInButton } from '@/components/attendance/CheckInButton';
import { Skeleton } from '@/components/ui/skeleton';
import type { PageProps } from '@jarvis/shared/types/page';
import { format } from 'date-fns';

export const metadata = { title: 'Attendance' };

async function AttendanceContent({ month, userId, workspaceId }: {
  month: string;
  userId: string;
  workspaceId: string;
}) {
  const records = await getMonthlyAttendance(workspaceId, userId, month);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecord = records.find((r) => r.attendDate === today) ?? null;

  return (
    <div className="space-y-6">
      {/* Check-in/out action */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Today, {format(new Date(), 'MMMM d, yyyy')}</p>
          {todayRecord?.checkIn && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Checked in at {format(new Date(todayRecord.checkIn), 'HH:mm')}
            </p>
          )}
        </div>
        <CheckInButton todayRecord={todayRecord} />
      </div>

      {/* Calendar */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Monthly Overview
        </h2>
        <AttendanceCalendar records={records} month={month} />
      </section>

      {/* Table */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Daily Records
        </h2>
        <AttendanceTable records={records} month={month} />
      </section>
    </div>
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) redirect('/dashboard');

  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month =
    typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : defaultMonth;

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Track your check-in / check-out records.</p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[340px] w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <AttendanceContent
          month={month}
          userId={session.userId}
          workspaceId={session.workspaceId}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/attendance/out-manage/page.tsx`**

```typescript
'use client';

import * as React from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getOutManageList } from '@/lib/queries/attendance';
import { OutManageTable } from '@/components/attendance/OutManageTable';
import { OutManageForm } from '@/components/attendance/OutManageForm';
import { TimeDetailSheet } from '@/components/attendance/TimeDetailSheet';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { PageProps } from '@jarvis/shared/types/page';
import type { OutManageRecord } from '@/lib/queries/attendance';

export const metadata = { title: 'Out-of-Office Management' };

export default async function OutManagePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_READ)) redirect('/dashboard');

  const sp = await searchParams;
  const page = typeof sp.page === 'string' ? Math.max(1, Number(sp.page)) : 1;
  const status = ['pending', 'approved', 'rejected'].includes(sp.status as string)
    ? (sp.status as 'pending' | 'approved' | 'rejected')
    : undefined;

  const isAdmin = hasPermission(session, PERMISSIONS.ATTENDANCE_ADMIN);

  const result = await getOutManageList(session.workspaceId, session.userId, {
    page,
    limit: 20,
    status,
    allUsers: isAdmin,
  });

  return (
    <OutManagePageClient
      initialRecords={result.data}
      isManager={isAdmin}
    />
  );
}

// Client wrapper to hold sheet state
function OutManagePageClient({
  initialRecords,
  isManager,
}: {
  initialRecords: OutManageRecord[];
  isManager: boolean;
}) {
  const [selectedRecord, setSelectedRecord] = React.useState<OutManageRecord | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  function handleViewDetails(record: OutManageRecord) {
    setSelectedRecord(record);
    setSheetOpen(true);
  }

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Out-of-Office</h1>
          <p className="text-sm text-muted-foreground">Manage out-of-office requests and approvals.</p>
        </div>
        <OutManageForm>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </OutManageForm>
      </div>

      <OutManageTable
        records={initialRecords}
        isManager={isManager}
        onViewDetails={handleViewDetails}
      />

      <TimeDetailSheet
        record={selectedRecord}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
```

- [ ] **Step 3: Playwright e2e test**

Create `apps/web/e2e/attendance.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Attendance page', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes test user session is seeded or a login fixture is used
    await page.goto('/attendance');
  });

  test('renders attendance page with calendar and table', async ({ page }) => {
    await expect(page).toHaveTitle(/Attendance/);
    // Calendar heading
    await expect(page.getByText('Monthly Overview')).toBeVisible();
    // Table heading
    await expect(page.getByText('Daily Records')).toBeVisible();
  });

  test('check-in button is visible when not yet checked in', async ({ page }) => {
    // The button text is either "Check In" or a time string on hover
    const btn = page.getByRole('button', { name: /check in/i });
    await expect(btn).toBeVisible();
  });

  test('clicking check-in button posts to API and refreshes', async ({ page }) => {
    await page.route('/api/attendance', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'mock-id',
              checkIn: new Date().toISOString(),
              checkOut: null,
              status: 'present',
              attendDate: new Date().toISOString().split('T')[0],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    const checkInBtn = page.getByRole('button', { name: /check in/i });
    await checkInBtn.click();
    // After refresh, button should not be "Check In" anymore
    // (page refreshes and today's record now has checkIn)
    await page.waitForLoadState('networkidle');
  });

  test('navigates to out-of-office page', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    await expect(page).toHaveTitle(/Out-of-Office/);
    await expect(page.getByRole('button', { name: /new request/i })).toBeVisible();
  });

  test('opens new request dialog', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    await page.getByRole('button', { name: /new request/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('New Out-of-Office Request')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run Playwright tests**

```bash
pnpm --filter=web exec playwright test e2e/attendance.spec.ts --reporter=line
```

---

## Task 8: Commit

- [ ] **Step 1: Stage all new files**

```bash
git add \
  apps/web/app/api/attendance/route.ts \
  apps/web/app/api/attendance/route.test.ts \
  apps/web/app/api/attendance/out-manage/route.ts \
  apps/web/app/api/attendance/out-manage/route.test.ts \
  apps/web/lib/queries/attendance.ts \
  apps/web/components/attendance/AttendanceCalendar.tsx \
  apps/web/components/attendance/CheckInButton.tsx \
  apps/web/components/attendance/AttendanceTable.tsx \
  apps/web/components/attendance/OutManageForm.tsx \
  apps/web/components/attendance/OutManageTable.tsx \
  apps/web/components/attendance/TimeDetailSheet.tsx \
  apps/web/app/(app)/attendance/page.tsx \
  apps/web/app/(app)/attendance/out-manage/page.tsx \
  apps/web/e2e/attendance.spec.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: attendance tracking + out-of-office management with approval workflow"
```
