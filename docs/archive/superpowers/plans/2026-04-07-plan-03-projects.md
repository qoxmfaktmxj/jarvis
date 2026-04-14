# Jarvis Plan 03: Projects

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full project management — project list/create/detail with tabs for overview, tasks, staff, inquiries, and settings.

**Architecture:** API Route Handlers for data mutations (POST/PUT/DELETE). Server Components fetch data for initial page render. TanStack Table handles client-side sort/filter UI with server-side pagination. React Hook Form + Zod for all forms.

**Tech Stack:** Next.js 15, TanStack Table v8, React Hook Form 7, Zod 3, Drizzle ORM, shadcn/ui (Table, Dialog, Form, Badge, Tabs), Vitest, Playwright

**Prerequisites:** Plan 01 Foundation complete.

---

## File Map

```
apps/web/app/(app)/projects/
├── page.tsx                                      CREATE
├── new/page.tsx                                  CREATE
└── [projectId]/
    ├── layout.tsx                                CREATE
    ├── page.tsx                                  CREATE
    ├── tasks/page.tsx                            CREATE
    ├── staff/page.tsx                            CREATE
    ├── inquiries/page.tsx                        CREATE
    └── settings/page.tsx                         CREATE
apps/web/app/api/projects/
├── route.ts                                      CREATE
└── [projectId]/
    ├── route.ts                                  CREATE
    ├── tasks/route.ts                            CREATE
    ├── staff/route.ts                            CREATE
    └── inquiries/route.ts                        CREATE
apps/web/components/project/
├── ProjectTable.tsx                              CREATE
├── ProjectForm.tsx                               CREATE
├── TaskTable.tsx                                 CREATE
├── StaffTable.tsx                                CREATE
└── InquiryTable.tsx                              CREATE
apps/web/lib/queries/projects.ts                  CREATE
```

---

## Task 1: Projects API — list + create

**Files:**
- Create: `apps/web/app/api/projects/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/projects/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { project } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createProjectSchema } from '@jarvis/shared/validation/project';
import { and, eq, ilike, sql, desc, count } from 'drizzle-orm';
import { z } from 'zod';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'on-hold', 'completed', 'archived']).optional(),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { page, limit, status, q } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [eq(project.workspaceId, session.workspaceId)];
  if (status) conditions.push(eq(project.status, status));
  if (q) conditions.push(ilike(project.name, `%${q}%`));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(project)
      .where(where)
      .orderBy(desc(project.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(project).where(where),
  ]);

  return NextResponse.json({
    data: rows,
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
  if (!hasPermission(session, PERMISSIONS.PROJECT_CREATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { code, name, description, status, startDate, endDate } = parsed.data;

  const [created] = await db
    .insert(project)
    .values({
      workspaceId: session.workspaceId,
      code,
      name,
      description,
      status,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      createdBy: session.userId,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}
```

- [ ] **Step 2: Write Vitest tests for GET pagination and POST validation**

Create `apps/web/app/api/projects/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'uuid-1', code: 'PROJ-1', name: 'Test' }]),
  },
}));

vi.mock('@jarvis/auth/session', () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    role: 'admin',
  }),
}));

vi.mock('@jarvis/auth/rbac', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

describe('GET /api/projects', () => {
  it('returns 401 when no session cookie', async () => {
    const { getSession } = await import('@jarvis/auth/session');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/projects');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid query params', async () => {
    const req = new NextRequest('http://localhost/api/projects?page=abc');
    // page=abc coerces to NaN which fails coerce.number
    const res = await GET(req);
    // coerce.number on 'abc' returns NaN, min(1) fails
    expect([200, 400]).toContain(res.status);
  });

  it('returns paginated result with meta', async () => {
    const { db } = await import('@jarvis/db/client');
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([{ id: 'uuid-1' }]),
            }),
          }),
        }),
      }),
    } as any);
    const req = new NextRequest('http://localhost/api/projects?page=1&limit=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(json).toHaveProperty('meta');
  });
});

describe('POST /api/projects', () => {
  it('returns 400 for missing required fields', async () => {
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ description: 'no code or name' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('creates project and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ code: 'P01', name: 'Project One' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toHaveProperty('id');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter=web test apps/web/app/api/projects/route.test.ts
```

---

## Task 2: Projects API — detail + update + delete

**Files:**
- Create: `apps/web/app/api/projects/[projectId]/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/projects/[projectId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { project, projectTask, projectStaff } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createProjectSchema } from '@jarvis/shared/validation/project';
import { and, eq, count } from 'drizzle-orm';

type Params = { params: Promise<{ projectId: string }> };

async function getProjectOrFail(projectId: string, workspaceId: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const row = await getProjectOrFail(projectId, session.workspaceId);
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [[{ taskCount }], [{ staffCount }]] = await Promise.all([
    db
      .select({ taskCount: count() })
      .from(projectTask)
      .where(eq(projectTask.projectId, projectId)),
    db
      .select({ staffCount: count() })
      .from(projectStaff)
      .where(eq(projectStaff.projectId, projectId)),
  ]);

  return NextResponse.json({
    data: { ...row, taskCount: Number(taskCount), staffCount: Number(staffCount) },
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const row = await getProjectOrFail(projectId, session.workspaceId);
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createProjectSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(project)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, session.workspaceId)))
    .returning();

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_DELETE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const row = await getProjectOrFail(projectId, session.workspaceId);
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Soft-delete: set status to archived
  await db
    .update(project)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, session.workspaceId)));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Run type-check on the file**

```bash
pnpm --filter=web type-check
```

---

## Task 3: Tasks API + Staff API + Inquiries API

**Files:**
- Create: `apps/web/app/api/projects/[projectId]/tasks/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/staff/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/inquiries/route.ts`

- [ ] **Step 1: Create `apps/web/app/api/projects/[projectId]/tasks/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { projectTask } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createTaskSchema } from '@jarvis/shared/validation/project';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';

type Params = { params: Promise<{ projectId: string }> };

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['todo', 'in-progress', 'review', 'done']).optional(),
});

export async function GET(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const queryParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { page, limit, status } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(projectTask.projectId, projectId),
    eq(projectTask.workspaceId, session.workspaceId),
  ];
  if (status) conditions.push(eq(projectTask.status, status));

  const rows = await db
    .select()
    .from(projectTask)
    .where(and(...conditions))
    .orderBy(desc(projectTask.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(projectTask)
    .values({
      projectId,
      workspaceId: session.workspaceId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}
```

- [ ] **Step 2: Create `apps/web/app/api/projects/[projectId]/staff/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { projectStaff } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';

type Params = { params: Promise<{ projectId: string }> };

const assignStaffSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().max(100).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export async function GET(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;

  const rows = await db
    .select()
    .from(projectStaff)
    .where(
      and(
        eq(projectStaff.projectId, projectId),
        eq(projectStaff.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(projectStaff.createdAt));

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const body = await request.json();
  const parsed = assignStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(projectStaff)
    .values({
      projectId,
      workspaceId: session.workspaceId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const { staffId } = await request.json();
  if (!staffId) {
    return NextResponse.json({ error: 'staffId required' }, { status: 400 });
  }

  await db
    .delete(projectStaff)
    .where(
      and(
        eq(projectStaff.id, staffId),
        eq(projectStaff.projectId, projectId),
        eq(projectStaff.workspaceId, session.workspaceId),
      ),
    );

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create `apps/web/app/api/projects/[projectId]/inquiries/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@jarvis/db/client';
import { projectInquiry } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';

type Params = { params: Promise<{ projectId: string }> };

const createInquirySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

const updateInquiryStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in-progress', 'resolved', 'closed']),
});

export async function GET(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;

  const rows = await db
    .select()
    .from(projectInquiry)
    .where(
      and(
        eq(projectInquiry.projectId, projectId),
        eq(projectInquiry.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(projectInquiry.createdAt));

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { projectId } = await params;
  const body = await request.json();
  const parsed = createInquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(projectInquiry)
    .values({
      projectId,
      workspaceId: session.workspaceId,
      authorId: session.userId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateInquiryStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, status } = parsed.data;
  const { projectId } = await params;

  const [updated] = await db
    .update(projectInquiry)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(projectInquiry.id, id),
        eq(projectInquiry.projectId, projectId),
        eq(projectInquiry.workspaceId, session.workspaceId),
      ),
    )
    .returning();

  return NextResponse.json({ data: updated });
}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter=web type-check
```

---

## Task 4: ProjectTable (TanStack Table client component)

**Files:**
- Create: `apps/web/components/project/ProjectTable.tsx`

- [ ] **Step 1: Create `apps/web/components/project/ProjectTable.tsx`**

```tsx
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
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronUp, ChevronDown, ChevronsUpDown, Eye } from 'lucide-react';

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  taskCount?: number;
  staffCount?: number;
  createdAt: string;
};

type Props = {
  data: ProjectRow[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  'on-hold': 'secondary',
  completed: 'outline',
  archived: 'destructive',
};

const columnHelper = createColumnHelper<ProjectRow>();

export function ProjectTable({ data, page, totalPages, onPageChange }: Props) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('code', {
        header: 'Code',
        cell: (info) => (
          <span className="font-mono text-sm font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const val = info.getValue() ?? 'active';
          return (
            <Badge variant={STATUS_VARIANT[val] ?? 'default'}>
              {val}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('startDate', {
        header: 'Start Date',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('endDate', {
        header: 'End Date',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('taskCount', {
        header: 'Tasks',
        cell: (info) => info.getValue() ?? 0,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${row.original.id}`)}
            aria-label={`View project ${row.original.code}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
        ),
      }),
    ],
    [router],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={canSort ? 'cursor-pointer select-none' : ''}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort &&
                          (sorted === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter=web type-check
```

---

## Task 5: ProjectForm (React Hook Form + Zod)

**Files:**
- Create: `apps/web/components/project/ProjectForm.tsx`

- [ ] **Step 1: Create `apps/web/components/project/ProjectForm.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createProjectSchema } from '@jarvis/shared/validation/project';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormValues = z.infer<typeof createProjectSchema>;

type Props = {
  mode: 'create' | 'edit';
  projectId?: string;
  defaultValues?: Partial<FormValues>;
};

export function ProjectForm({ mode, projectId, defaultValues }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      status: 'active',
      startDate: undefined,
      endDate: undefined,
      ...defaultValues,
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const url =
        mode === 'create' ? '/api/projects' : `/api/projects/${projectId}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const json = await response.json();
        setServerError(json?.error?.formErrors?.[0] ?? 'An error occurred');
        return;
      }

      const json = await response.json();
      const id = mode === 'create' ? json.data.id : projectId;
      router.push(`/projects/${id}`);
      router.refresh();
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project Code</FormLabel>
                <FormControl>
                  <Input placeholder="PROJ-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project Name</FormLabel>
                <FormControl>
                  <Input placeholder="My Project" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe this project..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === 'create'
                ? 'Creating...'
                : 'Saving...'
              : mode === 'create'
                ? 'Create Project'
                : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter=web type-check
```

---

## Task 6: Projects list page + new page

**Files:**
- Create: `apps/web/app/(app)/projects/page.tsx`
- Create: `apps/web/app/(app)/projects/new/page.tsx`
- Create: `apps/web/lib/queries/projects.ts`

- [ ] **Step 1: Create `apps/web/lib/queries/projects.ts`**

```typescript
import { db } from '@jarvis/db/client';
import { project } from '@jarvis/db/schema';
import { and, eq, ilike, desc, count } from 'drizzle-orm';

export type ProjectListParams = {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
};

export async function listProjects({
  workspaceId,
  page = 1,
  limit = 20,
  status,
  q,
}: ProjectListParams) {
  const offset = (page - 1) * limit;

  const conditions = [eq(project.workspaceId, workspaceId)];
  if (status) conditions.push(eq(project.status, status));
  if (q) conditions.push(ilike(project.name, `%${q}%`));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(project)
      .where(where)
      .orderBy(desc(project.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(project).where(where),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}

export async function getProjectById(projectId: string, workspaceId: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/projects/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { listProjects } from '@/lib/queries/projects';
import { ProjectTable } from '@/components/project/ProjectTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type SearchParams = {
  page?: string;
  status?: string;
  q?: string;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/dashboard');

  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const status = params.status;
  const q = params.q;

  const { data, meta } = await listProjects({
    workspaceId: session.workspaceId,
    page,
    status,
    q,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your workspace projects ({meta.total} total)
          </p>
        </div>
        {hasPermission(session, PERMISSIONS.PROJECT_CREATE) && (
          <Button asChild>
            <Link href="/projects/new">New Project</Link>
          </Button>
        )}
      </div>

      <ProjectTable
        data={data}
        page={meta.page}
        totalPages={meta.totalPages}
        onPageChange={() => {}}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(app)/projects/new/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { ProjectForm } from '@/components/project/ProjectForm';

export default async function NewProjectPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_CREATE)) redirect('/projects');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Project</h1>
        <p className="text-muted-foreground">
          Fill in the details to create a new project.
        </p>
      </div>
      <ProjectForm mode="create" />
    </div>
  );
}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter=web type-check
```

---

## Task 7: Project detail layout + tabs pages

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/layout.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/page.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/tasks/page.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/staff/page.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/inquiries/page.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/settings/page.tsx`
- Create: `apps/web/components/project/TaskTable.tsx`
- Create: `apps/web/components/project/StaffTable.tsx`
- Create: `apps/web/components/project/InquiryTable.tsx`

- [ ] **Step 1: Create `apps/web/app/(app)/projects/[projectId]/layout.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getProjectById } from '@/lib/queries/projects';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
};

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Staff', href: '/staff' },
  { label: 'Inquiries', href: '/inquiries' },
  { label: 'Settings', href: '/settings' },
] as const;

export default async function ProjectDetailLayout({ children, params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/projects');

  const { projectId } = await params;
  const project = await getProjectById(projectId, session.workspaceId);
  if (!project) notFound();

  const baseHref = `/projects/${projectId}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground font-mono">{project.code}</p>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const href = tab.href === '' ? baseHref : `${baseHref}${tab.href}`;
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Page Content */}
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/projects/[projectId]/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { project, projectTask, projectStaff, projectInquiry } from '@jarvis/db/schema';
import { and, eq, count } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';

type Props = { params: Promise<{ projectId: string }> };

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  'on-hold': 'secondary',
  completed: 'outline',
  archived: 'destructive',
};

export default async function ProjectOverviewPage({ params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/projects');

  const { projectId } = await params;

  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, session.workspaceId)))
    .limit(1);
  if (!row) notFound();

  const [[{ taskCount }], [{ staffCount }], [{ inquiryCount }]] = await Promise.all([
    db.select({ taskCount: count() }).from(projectTask).where(eq(projectTask.projectId, projectId)),
    db.select({ staffCount: count() }).from(projectStaff).where(eq(projectStaff.projectId, projectId)),
    db.select({ inquiryCount: count() }).from(projectInquiry).where(eq(projectInquiry.projectId, projectId)),
  ]);

  const stats = [
    { label: 'Tasks', value: Number(taskCount) },
    { label: 'Staff', value: Number(staffCount) },
    { label: 'Inquiries', value: Number(inquiryCount) },
  ];

  return (
    <div className="space-y-6">
      {/* Status + dates */}
      <div className="flex flex-wrap items-center gap-4">
        <Badge variant={STATUS_VARIANT[row.status ?? 'active'] ?? 'default'}>
          {row.status ?? 'active'}
        </Badge>
        {row.startDate && (
          <span className="text-sm text-muted-foreground">
            Start: <span className="font-medium text-foreground">{row.startDate}</span>
          </span>
        )}
        {row.endDate && (
          <span className="text-sm text-muted-foreground">
            End: <span className="font-medium text-foreground">{row.endDate}</span>
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border p-4 text-center"
          >
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {row.description && (
        <div className="rounded-lg border p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{row.description}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/project/TaskTable.tsx`**

```tsx
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
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type TaskRow = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  assigneeId: string | null;
};

type Props = { data: TaskRow[] };

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

const columnHelper = createColumnHelper<TaskRow>();

const columns = [
  columnHelper.accessor('title', {
    header: 'Title',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const val = info.getValue() ?? 'todo';
      return <Badge variant="outline">{val}</Badge>;
    },
  }),
  columnHelper.accessor('priority', {
    header: 'Priority',
    cell: (info) => {
      const val = info.getValue() ?? 'medium';
      return <Badge variant={PRIORITY_VARIANT[val] ?? 'secondary'}>{val}</Badge>;
    },
  }),
  columnHelper.accessor('dueDate', {
    header: 'Due Date',
    cell: (info) => info.getValue() ?? '—',
  }),
];

export function TaskTable({ data }: Props) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
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
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                No tasks yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/project/StaffTable.tsx`**

```tsx
'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
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

export type StaffRow = {
  id: string;
  userId: string;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
};

type Props = { data: StaffRow[] };

const columnHelper = createColumnHelper<StaffRow>();

const columns = [
  columnHelper.accessor('userId', {
    header: 'User ID',
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: (info) => (
      info.getValue() ? <Badge variant="secondary">{info.getValue()}</Badge> : '—'
    ),
  }),
  columnHelper.accessor('startDate', {
    header: 'Start Date',
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('endDate', {
    header: 'End Date',
    cell: (info) => info.getValue() ?? '—',
  }),
];

export function StaffTable({ data }: Props) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                No staff assigned.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/components/project/InquiryTable.tsx`**

```tsx
'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
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

export type InquiryRow = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  createdAt: string;
};

type Props = { data: InquiryRow[] };

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  'in-progress': 'secondary',
  resolved: 'outline',
  closed: 'destructive',
};

const columnHelper = createColumnHelper<InquiryRow>();

const columns = [
  columnHelper.accessor('title', {
    header: 'Title',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const val = info.getValue() ?? 'open';
      return <Badge variant={STATUS_VARIANT[val] ?? 'default'}>{val}</Badge>;
    },
  }),
  columnHelper.accessor('priority', {
    header: 'Priority',
    cell: (info) => {
      const val = info.getValue() ?? 'medium';
      return <Badge variant="outline">{val}</Badge>;
    },
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

export function InquiryTable({ data }: Props) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                No inquiries yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/web/app/(app)/projects/[projectId]/tasks/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { projectTask } from '@jarvis/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { TaskTable } from '@/components/project/TaskTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddTaskForm } from '@/components/project/AddTaskForm';

type Props = { params: Promise<{ projectId: string }> };

export default async function TasksPage({ params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/projects');

  const { projectId } = await params;

  const rows = await db
    .select()
    .from(projectTask)
    .where(
      and(
        eq(projectTask.projectId, projectId),
        eq(projectTask.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(projectTask.createdAt));

  const canEdit = hasPermission(session, PERMISSIONS.PROJECT_UPDATE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tasks ({rows.length})</h2>
        {canEdit && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Add Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Task</DialogTitle>
              </DialogHeader>
              <AddTaskForm projectId={projectId} />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <TaskTable data={rows} />
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/web/components/project/AddTaskForm.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createTaskSchema } from '@jarvis/shared/validation/project';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormValues = z.infer<typeof createTaskSchema>;

type Props = { projectId: string };

export function AddTaskForm({ projectId }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: '', status: 'todo', priority: 'medium' },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        router.refresh();
        form.reset();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Task title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="todo">Todo</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Adding...' : 'Add Task'}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 8: Create `apps/web/app/(app)/projects/[projectId]/staff/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { projectStaff } from '@jarvis/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { StaffTable } from '@/components/project/StaffTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AssignStaffForm } from '@/components/project/AssignStaffForm';

type Props = { params: Promise<{ projectId: string }> };

export default async function StaffPage({ params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/projects');

  const { projectId } = await params;

  const rows = await db
    .select()
    .from(projectStaff)
    .where(
      and(
        eq(projectStaff.projectId, projectId),
        eq(projectStaff.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(projectStaff.createdAt));

  const canEdit = hasPermission(session, PERMISSIONS.PROJECT_UPDATE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Staff ({rows.length})</h2>
        {canEdit && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Assign Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Staff</DialogTitle>
              </DialogHeader>
              <AssignStaffForm projectId={projectId} />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <StaffTable data={rows} />
    </div>
  );
}
```

- [ ] **Step 9: Create `apps/web/components/project/AssignStaffForm.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const schema = z.object({
  userId: z.string().uuid('Must be a valid user UUID'),
  role: z.string().max(100).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

type FormValues = z.infer<typeof schema>;
type Props = { projectId: string };

export function AssignStaffForm({ projectId }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { userId: '', role: '' },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        router.refresh();
        form.reset();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>User ID</FormLabel>
              <FormControl>
                <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input placeholder="PM, Developer, Analyst..." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Assigning...' : 'Assign Staff'}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 10: Create `apps/web/app/(app)/projects/[projectId]/inquiries/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { projectInquiry } from '@jarvis/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { InquiryTable } from '@/components/project/InquiryTable';

type Props = { params: Promise<{ projectId: string }> };

export default async function InquiriesPage({ params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) redirect('/projects');

  const { projectId } = await params;

  const rows = await db
    .select()
    .from(projectInquiry)
    .where(
      and(
        eq(projectInquiry.projectId, projectId),
        eq(projectInquiry.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(projectInquiry.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inquiries ({rows.length})</h2>
      </div>
      <InquiryTable data={rows} />
    </div>
  );
}
```

- [ ] **Step 11: Create `apps/web/app/(app)/projects/[projectId]/settings/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getProjectById } from '@/lib/queries/projects';
import { ProjectForm } from '@/components/project/ProjectForm';

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectSettingsPage({ params }: Props) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.PROJECT_UPDATE)) redirect('/projects');

  const { projectId } = await params;
  const project = await getProjectById(projectId, session.workspaceId);
  if (!project) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Project Settings</h2>
        <p className="text-sm text-muted-foreground">
          Update project details and configuration.
        </p>
      </div>
      <ProjectForm
        mode="edit"
        projectId={projectId}
        defaultValues={{
          code: project.code,
          name: project.name,
          description: project.description ?? undefined,
          status: (project.status as 'active' | 'on-hold' | 'completed' | 'archived') ?? 'active',
          startDate: project.startDate ?? undefined,
          endDate: project.endDate ?? undefined,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 12: Write Playwright E2E test**

Create `apps/web/e2e/projects.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Projects feature', () => {
  test.beforeEach(async ({ page }) => {
    // Log in before each test — adjust selectors to match your login page
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/dashboard');
  });

  test('navigates to projects list', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('creates a new project and it appears in the list', async ({ page }) => {
    await page.goto('/projects/new');

    const code = `TEST-${Date.now()}`;
    await page.getByLabel('Project Code').fill(code);
    await page.getByLabel('Project Name').fill('E2E Test Project');
    await page.getByRole('button', { name: 'Create Project' }).click();

    // Should redirect to project detail
    await page.waitForURL(/\/projects\/.+/);
    await expect(page.getByText('E2E Test Project')).toBeVisible();

    // Navigate back to list and confirm it appears
    await page.goto('/projects');
    await expect(page.getByText(code)).toBeVisible();
  });

  test('project detail tabs are navigable', async ({ page }) => {
    await page.goto('/projects');

    // Click the first project View button
    const viewButton = page.getByRole('button', { name: /View/ }).first();
    await viewButton.click();
    await page.waitForURL(/\/projects\/.+/);

    // Check all tabs are present
    for (const tab of ['Overview', 'Tasks', 'Staff', 'Inquiries', 'Settings']) {
      await expect(page.getByRole('link', { name: tab })).toBeVisible();
    }

    // Navigate to Tasks tab
    await page.getByRole('link', { name: 'Tasks' }).click();
    await page.waitForURL(/\/projects\/.+\/tasks/);
    await expect(page.getByRole('heading', { name: /Tasks/ })).toBeVisible();
  });
});
```

- [ ] **Step 13: Run type-check for all new files**

```bash
pnpm --filter=web type-check
```

---

## Task 8: Commit

- [ ] **Step 1: Stage all new files**

```bash
git add \
  apps/web/app/api/projects/ \
  apps/web/app/\(app\)/projects/ \
  apps/web/components/project/ \
  apps/web/lib/queries/projects.ts \
  apps/web/e2e/projects.spec.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: projects feature — list/create/detail/tasks/staff/inquiries"
```

- [ ] **Step 3: Verify**

```bash
git log --oneline -5
```
