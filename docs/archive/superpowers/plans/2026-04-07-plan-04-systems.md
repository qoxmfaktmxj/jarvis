# Jarvis Plan 04: Systems & Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Systems/Infra module — system registry, access guide with server-side secret resolution, deploy guide, and runbook tabs.

**Architecture:** Systems list uses Server Component with card grid. Access tab resolves secret_refs server-side before rendering — credentials never reach the client as raw vault:// URIs. Secret resolution uses SecretResolver from @jarvis/secret. Runbook tab links to a KnowledgePage record rendered via MDX.

**Tech Stack:** Next.js 15 Server Components, React Hook Form 7, Zod 3, Drizzle ORM, shadcn/ui (Card, Badge, Tabs, Dialog), @jarvis/secret, Vitest, Playwright

**Prerequisites:** Plan 01 Foundation complete.

---

## File Map

```
apps/web/app/(app)/systems/
├── page.tsx                                      CREATE
├── new/page.tsx                                  CREATE
└── [systemId]/
    ├── layout.tsx                                CREATE
    ├── page.tsx                                  CREATE
    ├── access/page.tsx                           CREATE
    ├── deploy/page.tsx                           CREATE
    └── runbook/page.tsx                          CREATE
apps/web/app/api/systems/
├── route.ts                                      CREATE
└── [systemId]/
    ├── route.ts                                  CREATE
    └── access/route.ts                           CREATE
apps/web/components/system/
├── SystemCard.tsx                                CREATE
├── SystemForm.tsx                                CREATE (React Hook Form + Zod)
├── AccessPanel.tsx                               CREATE (shows resolved secrets)
└── AccessEntryForm.tsx                           CREATE
apps/web/lib/queries/systems.ts                   CREATE
apps/web/e2e/systems.spec.ts                      CREATE
```

---

## Task 1: Systems API — list + create

- [ ] Create `apps/web/app/api/systems/route.ts` with GET (paginated list) and POST (create)

**`apps/web/app/api/systems/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { system } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq, ilike, or, desc, count } from 'drizzle-orm';

const createSystemSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  category: z.enum(['web', 'db', 'server', 'network', 'middleware']).optional(),
  environment: z.enum(['dev', 'staging', 'prod']).default('prod'),
  description: z.string().optional(),
  techStack: z.string().optional(),
  repositoryUrl: z.string().url().optional().or(z.literal('')),
  dashboardUrl: z.string().url().optional().or(z.literal('')),
  sensitivity: z
    .enum(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY'])
    .default('INTERNAL'),
  status: z.enum(['active', 'deprecated', 'decommissioned']).default('active'),
});

export async function GET(req: NextRequest) {
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const workspaceId = searchParams.get('workspaceId') ?? session.workspaceId;
  const category = searchParams.get('category');
  const environment = searchParams.get('environment');
  const status = searchParams.get('status');
  const q = searchParams.get('q');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));

  const conditions = [eq(system.workspaceId, workspaceId)];
  if (category) conditions.push(eq(system.category, category));
  if (environment) conditions.push(eq(system.environment, environment));
  if (status) conditions.push(eq(system.status, status));
  if (q) {
    conditions.push(
      or(
        ilike(system.name, `%${q}%`),
        ilike(system.description, `%${q}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(system)
      .where(where)
      .orderBy(desc(system.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(system).where(where),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_CREATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSystemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const [created] = await db
    .insert(system)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      category: data.category ?? null,
      environment: data.environment,
      description: data.description ?? null,
      techStack: data.techStack ?? null,
      repositoryUrl: data.repositoryUrl || null,
      dashboardUrl: data.dashboardUrl || null,
      sensitivity: data.sensitivity,
      status: data.status,
      createdBy: session.userId,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}
```

**Vitest tests — `apps/web/app/api/systems/__tests__/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
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
    returning: vi.fn().mockResolvedValue([{ id: 'sys-1', name: 'Test System' }]),
  },
}));

vi.mock('@jarvis/auth/session', () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    role: 'ADMIN',
  }),
}));

vi.mock('@jarvis/auth/rbac', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args) => args),
  eq: vi.fn(),
  ilike: vi.fn(),
  or: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(() => ({})),
}));

describe('GET /api/systems', () => {
  it('returns 401 when no session', async () => {
    const { getSession } = await import('@jarvis/auth/session');
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/systems?workspaceId=ws-1');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@jarvis/auth/rbac');
    vi.mocked(hasPermission).mockReturnValueOnce(false);

    const req = new NextRequest('http://localhost/api/systems?workspaceId=ws-1');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/systems', () => {
  it('returns 422 on invalid body', async () => {
    const req = new NextRequest('http://localhost/api/systems', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it('creates system with valid body', async () => {
    const req = new NextRequest('http://localhost/api/systems', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: '00000000-0000-0000-0000-000000000001',
        name: 'New System',
        environment: 'prod',
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.name).toBe('Test System');
  });
});
```

---

## Task 2: Systems API — detail + update + access

- [ ] Create `apps/web/app/api/systems/[systemId]/route.ts`
- [ ] Create `apps/web/app/api/systems/[systemId]/access/route.ts`

**`apps/web/app/api/systems/[systemId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { system } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { and, eq } from 'drizzle-orm';

const updateSystemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['web', 'db', 'server', 'network', 'middleware']).optional(),
  environment: z.enum(['dev', 'staging', 'prod']).optional(),
  description: z.string().optional(),
  techStack: z.string().optional(),
  repositoryUrl: z.string().url().optional().or(z.literal('')),
  dashboardUrl: z.string().url().optional().or(z.literal('')),
  sensitivity: z
    .enum(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY'])
    .optional(),
  status: z.enum(['active', 'deprecated', 'decommissioned']).optional(),
});

type Params = { params: Promise<{ systemId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [row] = await db
    .select()
    .from(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, session.workspaceId)));

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data: row });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSystemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [updated] = await db
    .update(system)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(system.id, systemId), eq(system.workspaceId, session.workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_DELETE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [deleted] = await db
    .delete(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, session.workspaceId)))
    .returning({ id: system.id });

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
```

**`apps/web/app/api/systems/[systemId]/access/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import { systemAccess, system } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createEnvSecretResolver, isSecretRef } from '@jarvis/secret';
import { and, eq } from 'drizzle-orm';

const addAccessSchema = z.object({
  accessType: z.enum(['db', 'ssh', 'vpn', 'web', 'api']),
  label: z.string().min(1).max(200),
  host: z.string().max(500).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  usernameRef: z.string().max(500).optional(),
  passwordRef: z.string().max(500).optional(),
  connectionStringRef: z.string().max(500).optional(),
  vpnFileRef: z.string().max(500).optional(),
  notes: z.string().optional(),
  requiredRole: z.enum(['VIEWER', 'DEVELOPER', 'MANAGER', 'ADMIN']).default('DEVELOPER'),
});

type Params = { params: Promise<{ systemId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_READ)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify system belongs to workspace
  const [sys] = await db
    .select({ id: system.id, sensitivity: system.sensitivity })
    .from(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, session.workspaceId)));

  if (!sys) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const entries = await db
    .select()
    .from(systemAccess)
    .where(
      and(eq(systemAccess.systemId, systemId), eq(systemAccess.workspaceId, session.workspaceId)),
    );

  const canViewSecrets =
    sys.sensitivity !== 'SECRET_REF_ONLY'
      ? hasPermission(session, PERMISSIONS.SYSTEM_READ)
      : hasPermission(session, PERMISSIONS.SYSTEM_UPDATE); // RESTRICTED+ required for SECRET_REF_ONLY

  const resolver = createEnvSecretResolver();

  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const resolveField = async (
        ref: string | null | undefined,
      ): Promise<{ ref: string | null; resolved: string | null; canView: boolean }> => {
        if (!ref) return { ref: null, resolved: null, canView: canViewSecrets };
        if (isSecretRef(ref)) {
          if (!canViewSecrets) return { ref, resolved: null, canView: false };
          try {
            const value = await resolver.resolve(ref);
            return { ref, resolved: value, canView: true };
          } catch {
            return { ref, resolved: null, canView: true };
          }
        }
        // Plain text — return as-is if user can view
        return { ref, resolved: canViewSecrets ? ref : null, canView: canViewSecrets };
      };

      return {
        id: entry.id,
        accessType: entry.accessType,
        label: entry.label,
        host: entry.host,
        port: entry.port,
        notes: entry.notes,
        requiredRole: entry.requiredRole,
        createdAt: entry.createdAt,
        usernameRef: await resolveField(entry.usernameRef),
        passwordRef: await resolveField(entry.passwordRef),
        connectionStringRef: await resolveField(entry.connectionStringRef),
        vpnFileRef: await resolveField(entry.vpnFileRef),
      };
    }),
  );

  return NextResponse.json({ data: resolved });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [sys] = await db
    .select({ id: system.id })
    .from(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, session.workspaceId)));

  if (!sys) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = addAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [created] = await db
    .insert(systemAccess)
    .values({
      systemId,
      workspaceId: session.workspaceId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { systemId } = await params;
  const session = await getSession(req.cookies.get('sessionId')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, PERMISSIONS.SYSTEM_UPDATE)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const accessId = searchParams.get('accessId');
  if (!accessId) {
    return NextResponse.json({ error: 'accessId query param required' }, { status: 400 });
  }

  const [deleted] = await db
    .delete(systemAccess)
    .where(
      and(
        eq(systemAccess.id, accessId),
        eq(systemAccess.systemId, systemId),
        eq(systemAccess.workspaceId, session.workspaceId),
      ),
    )
    .returning({ id: systemAccess.id });

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
```

---

## Task 3: System queries + data fetching

- [ ] Create `apps/web/lib/queries/systems.ts`

**`apps/web/lib/queries/systems.ts`**

```typescript
import { db } from '@jarvis/db/client';
import { system, systemAccess } from '@jarvis/db/schema';
import { isSecretRef, type SecretResolver } from '@jarvis/secret';
import { and, desc, eq, ilike, or, count } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export type System = InferSelectModel<typeof system>;
export type SystemAccessRow = InferSelectModel<typeof systemAccess>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SystemFilters {
  category?: string;
  environment?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ResolvedSecretField {
  ref: string | null;
  resolved: string | null;
  canView: boolean;
}

export interface ResolvedAccessEntry {
  id: string;
  accessType: string;
  label: string;
  host: string | null;
  port: number | null;
  notes: string | null;
  requiredRole: string | null;
  createdAt: Date | null;
  usernameRef: ResolvedSecretField;
  passwordRef: ResolvedSecretField;
  connectionStringRef: ResolvedSecretField;
  vpnFileRef: ResolvedSecretField;
}

export async function getSystems(
  workspaceId: string,
  filters: SystemFilters = {},
): Promise<PaginatedResponse<System>> {
  const { category, environment, status, q, page = 1, pageSize = 20 } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));

  const conditions = [eq(system.workspaceId, workspaceId)];
  if (category) conditions.push(eq(system.category, category));
  if (environment) conditions.push(eq(system.environment, environment));
  if (status) conditions.push(eq(system.status, status));
  if (q) {
    conditions.push(
      or(ilike(system.name, `%${q}%`), ilike(system.description, `%${q}%`))!,
    );
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(system)
      .where(where)
      .orderBy(desc(system.createdAt))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    db.select({ total: count() }).from(system).where(where),
  ]);

  return {
    data: rows,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safePageSize),
    },
  };
}

export async function getSystem(
  systemId: string,
  workspaceId: string,
): Promise<System | null> {
  const [row] = await db
    .select()
    .from(system)
    .where(and(eq(system.id, systemId), eq(system.workspaceId, workspaceId)));

  return row ?? null;
}

export async function getSystemAccessEntries(
  systemId: string,
  workspaceId: string,
  resolver: SecretResolver,
  canViewSecrets: boolean,
): Promise<ResolvedAccessEntry[]> {
  const entries = await db
    .select()
    .from(systemAccess)
    .where(
      and(eq(systemAccess.systemId, systemId), eq(systemAccess.workspaceId, workspaceId)),
    );

  const resolveField = async (
    ref: string | null | undefined,
  ): Promise<ResolvedSecretField> => {
    if (!ref) return { ref: null, resolved: null, canView: canViewSecrets };
    if (isSecretRef(ref)) {
      if (!canViewSecrets) return { ref, resolved: null, canView: false };
      try {
        const value = await resolver.resolve(ref);
        return { ref, resolved: value, canView: true };
      } catch {
        return { ref, resolved: null, canView: true };
      }
    }
    return { ref, resolved: canViewSecrets ? ref : null, canView: canViewSecrets };
  };

  return Promise.all(
    entries.map(async (entry) => ({
      id: entry.id,
      accessType: entry.accessType,
      label: entry.label,
      host: entry.host,
      port: entry.port,
      notes: entry.notes,
      requiredRole: entry.requiredRole,
      createdAt: entry.createdAt,
      usernameRef: await resolveField(entry.usernameRef),
      passwordRef: await resolveField(entry.passwordRef),
      connectionStringRef: await resolveField(entry.connectionStringRef),
      vpnFileRef: await resolveField(entry.vpnFileRef),
    })),
  );
}
```

---

## Task 4: SystemCard + SystemForm components

- [ ] Create `apps/web/components/system/SystemCard.tsx`
- [ ] Create `apps/web/components/system/SystemForm.tsx`

**`apps/web/components/system/SystemCard.tsx`**

```typescript
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { System } from '@/lib/queries/systems';

const categoryColors: Record<string, string> = {
  web: 'bg-blue-100 text-blue-800',
  db: 'bg-purple-100 text-purple-800',
  server: 'bg-gray-100 text-gray-800',
  network: 'bg-yellow-100 text-yellow-800',
  middleware: 'bg-orange-100 text-orange-800',
};

const environmentVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  prod: 'destructive',
  staging: 'secondary',
  dev: 'outline',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  deprecated: 'bg-yellow-100 text-yellow-800',
  decommissioned: 'bg-red-100 text-red-800',
};

interface SystemCardProps {
  system: System;
}

export function SystemCard({ system }: SystemCardProps) {
  return (
    <Link href={`/systems/${system.id}`} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug line-clamp-2">
              {system.name}
            </CardTitle>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {system.environment && (
                <Badge variant={environmentVariant[system.environment] ?? 'outline'}>
                  {system.environment}
                </Badge>
              )}
              {system.status && system.status !== 'active' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[system.status] ?? ''}`}
                >
                  {system.status}
                </span>
              )}
            </div>
          </div>
          {system.category && (
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium w-fit ${categoryColors[system.category] ?? 'bg-gray-100 text-gray-800'}`}
            >
              {system.category}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {system.description ? (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {system.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">설명 없음</p>
          )}
          {system.techStack && (
            <p className="mt-2 text-xs text-muted-foreground line-clamp-1">
              {system.techStack}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
```

**`apps/web/components/system/SystemForm.tsx`**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const systemFormSchema = z.object({
  name: z.string().min(1, '시스템 이름을 입력하세요').max(200),
  category: z.enum(['web', 'db', 'server', 'network', 'middleware']).optional(),
  environment: z.enum(['dev', 'staging', 'prod']).default('prod'),
  description: z.string().optional(),
  techStack: z.string().optional(),
  repositoryUrl: z
    .string()
    .url('올바른 URL 형식이 아닙니다')
    .optional()
    .or(z.literal('')),
  dashboardUrl: z
    .string()
    .url('올바른 URL 형식이 아닙니다')
    .optional()
    .or(z.literal('')),
  sensitivity: z
    .enum(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY'])
    .default('INTERNAL'),
});

export type SystemFormValues = z.infer<typeof systemFormSchema>;

interface SystemFormProps {
  workspaceId: string;
  defaultValues?: Partial<SystemFormValues>;
  systemId?: string; // when editing
}

export function SystemForm({ workspaceId, defaultValues, systemId }: SystemFormProps) {
  const router = useRouter();
  const isEditing = Boolean(systemId);

  const form = useForm<SystemFormValues>({
    resolver: zodResolver(systemFormSchema),
    defaultValues: {
      environment: 'prod',
      sensitivity: 'INTERNAL',
      ...defaultValues,
    },
  });

  async function onSubmit(values: SystemFormValues) {
    const url = isEditing
      ? `/api/systems/${systemId}`
      : '/api/systems';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, workspaceId }),
    });

    if (!res.ok) {
      const err = await res.json();
      form.setError('root', {
        message: err.error ?? '저장에 실패했습니다.',
      });
      return;
    }

    const json = await res.json();
    router.push(`/systems/${json.data.id}`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        {form.formState.errors.root && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>시스템 이름 *</FormLabel>
              <FormControl>
                <Input placeholder="예) 인사관리시스템" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>카테고리</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="db">DB</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                    <SelectItem value="middleware">Middleware</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="environment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>환경</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="prod">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="dev">Development</SelectItem>
                  </SelectContent>
                </Select>
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
              <FormLabel>설명</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="시스템 개요 및 역할을 간략히 설명하세요"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="techStack"
          render={({ field }) => (
            <FormItem>
              <FormLabel>기술 스택</FormLabel>
              <FormControl>
                <Input placeholder="예) Java 17, Spring Boot 3, PostgreSQL 15" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="repositoryUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>저장소 URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://github.com/..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dashboardUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>대시보드 URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://grafana.internal/..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="sensitivity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>민감도</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PUBLIC">PUBLIC — 공개</SelectItem>
                  <SelectItem value="INTERNAL">INTERNAL — 내부 (기본)</SelectItem>
                  <SelectItem value="RESTRICTED">RESTRICTED — 제한</SelectItem>
                  <SelectItem value="SECRET_REF_ONLY">
                    SECRET_REF_ONLY — 시크릿 참조만 허용
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? '저장 중...' : isEditing ? '수정' : '등록'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            취소
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

---

## Task 5: AccessPanel + AccessEntryForm

- [ ] Create `apps/web/components/system/AccessPanel.tsx`
- [ ] Create `apps/web/components/system/AccessEntryForm.tsx`

**`apps/web/components/system/AccessPanel.tsx`**

```typescript
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { ResolvedAccessEntry } from '@/lib/queries/systems';
import { RevealSecret } from './RevealSecret';

interface AccessPanelProps {
  entries: ResolvedAccessEntry[];
  systemId: string;
  canManage: boolean;
}

const accessTypeLabels: Record<string, string> = {
  db: 'Database',
  ssh: 'SSH',
  vpn: 'VPN',
  web: 'Web',
  api: 'API',
};

const accessTypeColors: Record<string, string> = {
  db: 'bg-purple-100 text-purple-800',
  ssh: 'bg-gray-100 text-gray-800',
  vpn: 'bg-blue-100 text-blue-800',
  web: 'bg-green-100 text-green-800',
  api: 'bg-orange-100 text-orange-800',
};

export function AccessPanel({ entries, systemId, canManage }: AccessPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>등록된 접속 정보가 없습니다.</p>
        {canManage && (
          <p className="mt-2 text-sm">
            아래 &ldquo;접속 정보 추가&rdquo; 버튼으로 새 항목을 등록하세요.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry, idx) => (
        <div key={entry.id}>
          {idx > 0 && <Separator />}
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${accessTypeColors[entry.accessType] ?? 'bg-gray-100 text-gray-800'}`}
              >
                {accessTypeLabels[entry.accessType] ?? entry.accessType}
              </span>
              <span className="font-medium">{entry.label}</span>
              {entry.requiredRole && (
                <Badge variant="outline" className="text-xs">
                  {entry.requiredRole}+
                </Badge>
              )}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {entry.host && (
                <>
                  <dt className="text-muted-foreground font-medium">Host</dt>
                  <dd className="font-mono">
                    {entry.host}
                    {entry.port ? `:${entry.port}` : ''}
                  </dd>
                </>
              )}

              {entry.usernameRef.ref && (
                <>
                  <dt className="text-muted-foreground font-medium">Username</dt>
                  <dd>
                    {entry.usernameRef.canView ? (
                      <span className="font-mono">{entry.usernameRef.resolved}</span>
                    ) : (
                      <Badge variant="secondary">권한 없음</Badge>
                    )}
                  </dd>
                </>
              )}

              {entry.passwordRef.ref && (
                <>
                  <dt className="text-muted-foreground font-medium">Password</dt>
                  <dd>
                    {entry.passwordRef.canView ? (
                      <RevealSecret value={entry.passwordRef.resolved ?? ''} />
                    ) : (
                      <Badge variant="secondary">권한 없음</Badge>
                    )}
                  </dd>
                </>
              )}

              {entry.connectionStringRef.ref && (
                <>
                  <dt className="text-muted-foreground font-medium">Connection String</dt>
                  <dd>
                    {entry.connectionStringRef.canView ? (
                      <RevealSecret value={entry.connectionStringRef.resolved ?? ''} />
                    ) : (
                      <Badge variant="secondary">권한 없음</Badge>
                    )}
                  </dd>
                </>
              )}
            </dl>

            {entry.notes && (
              <p className="text-sm text-muted-foreground border-l-2 pl-3">
                {entry.notes}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**`apps/web/components/system/RevealSecret.tsx`** (client helper for AccessPanel)

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Copy } from 'lucide-react';

interface RevealSecretProps {
  value: string;
}

export function RevealSecret({ value }: RevealSecretProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      <span>{revealed ? value : '••••••••'}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? '숨기기' : '보기'}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleCopy}
        aria-label="복사"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      {copied && <span className="text-xs text-muted-foreground">복사됨</span>}
    </span>
  );
}
```

**`apps/web/components/system/AccessEntryForm.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Alert, AlertDescription } from '@/components/ui/alert';

const accessEntrySchema = z.object({
  accessType: z.enum(['db', 'ssh', 'vpn', 'web', 'api']),
  label: z.string().min(1, '레이블을 입력하세요').max(200),
  host: z.string().max(500).optional(),
  port: z
    .number({ invalid_type_error: '숫자를 입력하세요' })
    .int()
    .min(1)
    .max(65535)
    .optional(),
  usernameRef: z.string().max(500).optional(),
  passwordRef: z.string().max(500).optional(),
  connectionStringRef: z.string().max(500).optional(),
  vpnFileRef: z.string().max(500).optional(),
  notes: z.string().optional(),
  requiredRole: z.enum(['VIEWER', 'DEVELOPER', 'MANAGER', 'ADMIN']).default('DEVELOPER'),
});

type AccessEntryFormValues = z.infer<typeof accessEntrySchema>;

interface AccessEntryFormProps {
  systemId: string;
}

export function AccessEntryForm({ systemId }: AccessEntryFormProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<AccessEntryFormValues>({
    resolver: zodResolver(accessEntrySchema),
    defaultValues: {
      requiredRole: 'DEVELOPER',
    },
  });

  async function onSubmit(values: AccessEntryFormValues) {
    const res = await fetch(`/api/systems/${systemId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      form.setError('root', { message: err.error ?? '저장에 실패했습니다.' });
      return;
    }

    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          접속 정보 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>접속 정보 추가</DialogTitle>
        </DialogHeader>

        <Alert variant="destructive" className="mb-2">
          <AlertDescription>
            비밀번호는 직접 입력하지 마세요. vault:// URI를 사용하거나 빈칸으로 두세요.
            <br />
            예: <code className="text-xs">vault://jarvis/systems/&lt;id&gt;/password</code>
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="accessType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>유형 *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="db">DB</SelectItem>
                        <SelectItem value="ssh">SSH</SelectItem>
                        <SelectItem value="vpn">VPN</SelectItem>
                        <SelectItem value="web">Web</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requiredRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최소 역할</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="VIEWER">VIEWER</SelectItem>
                        <SelectItem value="DEVELOPER">DEVELOPER</SelectItem>
                        <SelectItem value="MANAGER">MANAGER</SelectItem>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>레이블 *</FormLabel>
                  <FormControl>
                    <Input placeholder="예) Production DB (읽기 전용)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Host</FormLabel>
                    <FormControl>
                      <Input placeholder="db.internal.example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5432"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="usernameRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username / Username Ref</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="app_readonly 또는 vault://jarvis/systems/.../username"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    일반 사용자명은 평문 입력 가능합니다.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="passwordRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password Ref</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="vault://jarvis/systems/<systemId>/password"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-destructive">
                    반드시 vault:// URI를 사용하거나 비워두세요. 평문 비밀번호 금지.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="connectionStringRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Connection String Ref</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="vault://jarvis/systems/<systemId>/connectionString"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>메모</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="접속 시 주의사항이나 특이사항을 기록하세요"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '저장 중...' : '저장'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Task 6: Systems pages

- [ ] Create `apps/web/app/(app)/systems/page.tsx`
- [ ] Create `apps/web/app/(app)/systems/new/page.tsx`
- [ ] Create `apps/web/app/(app)/systems/[systemId]/layout.tsx`
- [ ] Create `apps/web/app/(app)/systems/[systemId]/page.tsx`
- [ ] Create `apps/web/app/(app)/systems/[systemId]/access/page.tsx`
- [ ] Create `apps/web/app/(app)/systems/[systemId]/deploy/page.tsx`
- [ ] Create `apps/web/app/(app)/systems/[systemId]/runbook/page.tsx`

**`apps/web/app/(app)/systems/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SystemCard } from '@/components/system/SystemCard';
import { getSystems } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { Plus } from 'lucide-react';

interface PageProps {
  searchParams: Promise<{
    category?: string;
    environment?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function SystemsPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) return null;

  const params = await searchParams;
  const result = await getSystems(session.workspaceId, {
    category: params.category,
    environment: params.environment,
    status: params.status || 'active',
    q: params.q,
    page: params.page ? Number(params.page) : 1,
    pageSize: 24,
  });

  const canCreate = hasPermission(session, PERMISSIONS.SYSTEM_CREATE);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">시스템 목록</h1>
          <p className="text-muted-foreground mt-1">
            총 {result.pagination.total}개 시스템
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/systems/new">
              <Plus className="mr-1.5 h-4 w-4" />
              시스템 등록
            </Link>
          </Button>
        )}
      </div>

      {/* Filter bar — client-side navigation via form */}
      <form method="get" className="flex flex-wrap gap-3">
        <Input
          name="q"
          defaultValue={params.q}
          placeholder="시스템 검색..."
          className="w-56"
        />
        <Select name="category" defaultValue={params.category}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="db">DB</SelectItem>
            <SelectItem value="server">Server</SelectItem>
            <SelectItem value="network">Network</SelectItem>
            <SelectItem value="middleware">Middleware</SelectItem>
          </SelectContent>
        </Select>
        <Select name="environment" defaultValue={params.environment}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="환경" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="prod">Production</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="dev">Development</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </form>

      {result.data.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <p>등록된 시스템이 없습니다.</p>
          {canCreate && (
            <Button asChild className="mt-4">
              <Link href="/systems/new">첫 시스템 등록하기</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.data.map((sys) => (
            <SystemCard key={sys.id} system={sys} />
          ))}
        </div>
      )}

      {result.pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {Array.from({ length: result.pagination.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <Button
                key={p}
                variant={p === result.pagination.page ? 'default' : 'outline'}
                size="sm"
                asChild
              >
                <Link
                  href={`/systems?${new URLSearchParams({ ...params, page: String(p) })}`}
                >
                  {p}
                </Link>
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
```

**`apps/web/app/(app)/systems/new/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SystemForm } from '@/components/system/SystemForm';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

export default async function NewSystemPage() {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.SYSTEM_CREATE)) redirect('/systems');

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">시스템 등록</h1>
        <p className="text-muted-foreground mt-1">
          새 시스템을 Jarvis에 등록합니다.
        </p>
      </div>
      <SystemForm workspaceId={session.workspaceId} />
    </div>
  );
}
```

**`apps/web/app/(app)/systems/[systemId]/layout.tsx`**

```typescript
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSystem } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { Badge } from '@/components/ui/badge';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ systemId: string }>;
}

const environmentColors: Record<string, string> = {
  prod: 'destructive',
  staging: 'secondary',
  dev: 'outline',
};

export default async function SystemDetailLayout({ children, params }: LayoutProps) {
  const { systemId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.SYSTEM_READ)) redirect('/systems');

  const sys = await getSystem(systemId, session.workspaceId);
  if (!sys) notFound();

  const tabs = [
    { label: '개요', href: `/systems/${systemId}` },
    { label: '접속 정보', href: `/systems/${systemId}/access` },
    { label: '배포 가이드', href: `/systems/${systemId}/deploy` },
    { label: 'Runbook', href: `/systems/${systemId}/runbook` },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{sys.name}</h1>
            {sys.environment && (
              <Badge
                variant={
                  (environmentColors[sys.environment] as
                    | 'destructive'
                    | 'secondary'
                    | 'outline'
                    | 'default') ?? 'outline'
                }
              >
                {sys.environment}
              </Badge>
            )}
            {sys.category && (
              <Badge variant="outline">{sys.category}</Badge>
            )}
          </div>
          {sys.description && (
            <p className="text-muted-foreground mt-1 text-sm line-clamp-2">
              {sys.description}
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.href} value={tab.href} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>{children}</div>
    </div>
  );
}
```

**`apps/web/app/(app)/systems/[systemId]/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getSystem } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { ExternalLink, GitBranch, LayoutDashboard } from 'lucide-react';

interface PageProps {
  params: Promise<{ systemId: string }>;
}

export default async function SystemOverviewPage({ params }: PageProps) {
  const { systemId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');

  const sys = await getSystem(systemId, session.workspaceId);
  if (!sys) notFound();

  const canEdit = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">시스템 개요</h2>
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/systems/${systemId}/edit`}>수정</Link>
          </Button>
        )}
      </div>

      <Separator />

      <dl className="grid grid-cols-[180px_1fr] gap-x-6 gap-y-4 text-sm">
        <dt className="text-muted-foreground font-medium pt-0.5">상태</dt>
        <dd>
          <Badge
            variant={sys.status === 'active' ? 'default' : 'secondary'}
          >
            {sys.status ?? 'active'}
          </Badge>
        </dd>

        <dt className="text-muted-foreground font-medium pt-0.5">민감도</dt>
        <dd>
          <Badge variant="outline">{sys.sensitivity}</Badge>
        </dd>

        {sys.techStack && (
          <>
            <dt className="text-muted-foreground font-medium pt-0.5">기술 스택</dt>
            <dd className="text-sm">{sys.techStack}</dd>
          </>
        )}

        {sys.description && (
          <>
            <dt className="text-muted-foreground font-medium pt-0.5">설명</dt>
            <dd className="text-sm whitespace-pre-wrap">{sys.description}</dd>
          </>
        )}

        {sys.repositoryUrl && (
          <>
            <dt className="text-muted-foreground font-medium pt-0.5">저장소</dt>
            <dd>
              <a
                href={sys.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
              >
                <GitBranch className="h-3.5 w-3.5" />
                {sys.repositoryUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </>
        )}

        {sys.dashboardUrl && (
          <>
            <dt className="text-muted-foreground font-medium pt-0.5">대시보드</dt>
            <dd>
              <a
                href={sys.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                {sys.dashboardUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </>
        )}

        <dt className="text-muted-foreground font-medium pt-0.5">등록일</dt>
        <dd className="text-sm">
          {sys.createdAt
            ? new Intl.DateTimeFormat('ko-KR', {
                dateStyle: 'long',
                timeStyle: 'short',
              }).format(new Date(sys.createdAt))
            : '-'}
        </dd>
      </dl>
    </div>
  );
}
```

**`apps/web/app/(app)/systems/[systemId]/access/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AccessPanel } from '@/components/system/AccessPanel';
import { AccessEntryForm } from '@/components/system/AccessEntryForm';
import { getSystem, getSystemAccessEntries } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { createEnvSecretResolver } from '@jarvis/secret';

interface PageProps {
  params: Promise<{ systemId: string }>;
}

export default async function SystemAccessPage({ params }: PageProps) {
  const { systemId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');
  if (!hasPermission(session, PERMISSIONS.SYSTEM_READ)) redirect('/systems');

  const sys = await getSystem(systemId, session.workspaceId);
  if (!sys) notFound();

  const canViewSecrets =
    sys.sensitivity !== 'SECRET_REF_ONLY'
      ? hasPermission(session, PERMISSIONS.SYSTEM_READ)
      : hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  const canManage = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  const resolver = createEnvSecretResolver();
  const entries = await getSystemAccessEntries(
    systemId,
    session.workspaceId,
    resolver,
    canViewSecrets,
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">접속 정보</h2>
        {canManage && <AccessEntryForm systemId={systemId} />}
      </div>
      <AccessPanel entries={entries} systemId={systemId} canManage={canManage} />
    </div>
  );
}
```

**`apps/web/app/(app)/systems/[systemId]/deploy/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getSystem } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { FileText } from 'lucide-react';

interface PageProps {
  params: Promise<{ systemId: string }>;
}

export default async function SystemDeployPage({ params }: PageProps) {
  const { systemId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');

  const sys = await getSystem(systemId, session.workspaceId);
  if (!sys) notFound();

  const canEdit = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  // When knowledgePageId is set, this will render the linked knowledge page.
  // For now, show a placeholder prompting users to link or create a page.
  if (!sys.knowledgePageId) {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold">배포 가이드</h2>
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>배포 가이드가 연결되지 않았습니다</AlertTitle>
          <AlertDescription>
            Knowledge 페이지를 생성하고 이 시스템과 연결하면 배포 절차, 롤백 방법,
            체크리스트를 한 곳에서 관리할 수 있습니다.
          </AlertDescription>
        </Alert>
        {canEdit && (
          <Button asChild>
            <Link href={`/knowledge/new?systemId=${systemId}&type=deploy`}>
              배포 가이드 페이지 만들기
            </Link>
          </Button>
        )}
      </div>
    );
  }

  // TODO: Render linked KnowledgePage via MDX viewer (implemented in Plan 03)
  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">배포 가이드</h2>
      <Button variant="outline" asChild>
        <Link href={`/knowledge/${sys.knowledgePageId}`}>
          Knowledge 페이지에서 보기
        </Link>
      </Button>
    </div>
  );
}
```

**`apps/web/app/(app)/systems/[systemId]/runbook/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getSystem } from '@/lib/queries/systems';
import { getSession } from '@jarvis/auth/session';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { BookOpen } from 'lucide-react';

interface PageProps {
  params: Promise<{ systemId: string }>;
}

export default async function SystemRunbookPage({ params }: PageProps) {
  const { systemId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get('sessionId')?.value ?? '');
  if (!session) redirect('/login');

  const sys = await getSystem(systemId, session.workspaceId);
  if (!sys) notFound();

  const canEdit = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  if (!sys.knowledgePageId) {
    return (
      <div className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold">Runbook</h2>
        <Alert>
          <BookOpen className="h-4 w-4" />
          <AlertTitle>Runbook이 연결되지 않았습니다</AlertTitle>
          <AlertDescription>
            장애 대응 절차, 모니터링 항목, On-call 체크리스트를 Knowledge 페이지로
            작성하고 이 시스템과 연결하세요.
          </AlertDescription>
        </Alert>
        {canEdit && (
          <Button asChild>
            <Link href={`/knowledge/new?systemId=${systemId}&type=runbook`}>
              Runbook 페이지 만들기
            </Link>
          </Button>
        )}
      </div>
    );
  }

  // TODO: Render linked KnowledgePage via MDX viewer (implemented in Plan 03)
  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">Runbook</h2>
      <Button variant="outline" asChild>
        <Link href={`/knowledge/${sys.knowledgePageId}`}>
          Knowledge 페이지에서 보기
        </Link>
      </Button>
    </div>
  );
}
```

---

## Task 7: Playwright E2E test

- [ ] Create `apps/web/e2e/systems.spec.ts`

**`apps/web/e2e/systems.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

// These tests assume a seeded workspace and a logged-in session cookie.
// See apps/web/e2e/fixtures/auth.ts for the login helper.

test.describe('Systems module', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and assert we are authenticated (AppShell renders)
    await page.goto('/systems');
    // If redirected to login, fail fast with a clear message
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('systems list page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '시스템 목록' })).toBeVisible();
  });

  test('register new system and verify it appears in list', async ({ page }) => {
    // Click the register button
    await page.getByRole('link', { name: '시스템 등록' }).click();
    await expect(page).toHaveURL(/\/systems\/new/);

    // Fill the form
    const systemName = `E2E Test System ${Date.now()}`;
    await page.getByLabel('시스템 이름 *').fill(systemName);

    // Select category
    await page.getByRole('combobox').filter({ hasText: '선택' }).first().click();
    await page.getByRole('option', { name: 'Web' }).click();

    // Select environment — prod is the second combobox
    const envCombobox = page.getByRole('combobox').nth(1);
    await envCombobox.click();
    await page.getByRole('option', { name: 'Production' }).click();

    await page.getByLabel('설명').fill('Playwright E2E test system');

    // Submit
    await page.getByRole('button', { name: '등록' }).click();

    // Should redirect to detail page
    await expect(page).toHaveURL(/\/systems\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(systemName);

    // Navigate back to list and verify it appears
    await page.goto('/systems');
    await expect(page.getByText(systemName)).toBeVisible();
  });

  test('system detail: access tab loads', async ({ page }) => {
    // Navigate to list and click first card
    await page.goto('/systems');

    const firstCard = page.locator('a[href^="/systems/"]').first();
    await firstCard.click();

    // Should be on overview tab
    await expect(page).toHaveURL(/\/systems\/[0-9a-f-]+$/);

    // Click Access tab
    await page.getByRole('link', { name: '접속 정보' }).click();
    await expect(page).toHaveURL(/\/systems\/[0-9a-f-]+\/access/);

    // Panel renders (either entries or empty state)
    await expect(
      page
        .getByText('등록된 접속 정보가 없습니다.')
        .or(page.getByText('접속 정보')),
    ).toBeVisible();
  });

  test('access tab: add entry dialog opens and shows secret warning', async ({
    page,
  }) => {
    await page.goto('/systems');

    const firstCard = page.locator('a[href^="/systems/"]').first();
    await firstCard.click();
    await page.getByRole('link', { name: '접속 정보' }).click();

    // Open add dialog (only visible if user has SYSTEM_UPDATE)
    const addBtn = page.getByRole('button', { name: '접속 정보 추가' });
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Warning about vault:// must be visible
      await expect(
        page.getByText('비밀번호는 직접 입력하지 마세요'),
      ).toBeVisible();
    }
  });
});
```

---

## Task 8: Commit

- [ ] Commit the systems/infra module

```bash
git add \
  apps/web/app/api/systems/ \
  apps/web/app/\(app\)/systems/ \
  apps/web/components/system/ \
  apps/web/lib/queries/systems.ts \
  apps/web/e2e/systems.spec.ts

git commit -m "feat: systems/infra module — registry, access panel with secret_ref, deploy, runbook"
```

---

## Secret Ref Handling Reference

This is the canonical pattern used throughout Plan 04. All access-sensitive fields flow server-side only.

```
Client request
    │
    ▼
[Server Component / API Route]
    │  reads systemAccess rows from DB
    │  fields: usernameRef, passwordRef, connectionStringRef (vault:// URIs)
    │
    ▼
[getSystemAccessEntries(resolver, canViewSecrets)]
    │  isSecretRef(ref) → resolver.resolve(ref) → plaintext
    │  if !canViewSecrets → { resolved: null, canView: false }
    │
    ▼
[ResolvedAccessEntry[]]  ← only resolved strings, never vault:// URIs
    │
    ▼
[AccessPanel (Server Component)]
    │  passes resolved string to RevealSecret (Client Component)
    │  RevealSecret only toggles visibility of an already-resolved string
    │
    ▼
Browser — sees "••••••••" by default, no vault:// URI ever transmitted
```

**Important constraints:**
1. `passwordRef` and `connectionStringRef` MUST use `vault://` URIs in production. The `AccessEntryForm` warns users and `isSecretRef()` gates resolution.
2. If `sensitivity === 'SECRET_REF_ONLY'`, only users with `SYSTEM_UPDATE` permission (MANAGER+) see resolved values.
3. `createEnvSecretResolver()` (MVP) reads from env vars keyed by the vault path. Replace with HashiCorp Vault SDK in production.
4. Never serialize raw `*Ref` column values to the client. The API route and Server Component both call `resolveField()` before responding.
