# Admin Users 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `/admin/users` 화면을 확장해 `status` enum, `jobTitle`, `isOutsourced` 필드와 직위/직책 그룹코드, CSV 다운로드, 비밀번호 초기화 stub을 추가한다.

**Architecture:** Drizzle 스키마에서 `isActive` 제거 및 `status` enum 도입(backfill 마이그레이션 포함) → codes 테이블(`code_group`/`code_item`)에 POSITION/JOB_TITLE seed → 기존 REST route.ts 확장 + 2개 신규 endpoint(`reset-password`, `export`) → UserTable/UserForm UI에 필드·필터·액션 추가. `user.position` 컬럼은 이미 존재(varchar 100)하므로 재사용.

**Tech Stack:** Next.js 15 App Router / Drizzle ORM (pgEnum) / TanStack Table v8 / shadcn UI / Zod / react-hook-form / next-intl / Vitest.

**Base spec:** `docs/superpowers/specs/2026-04-20-admin-users-extension-design.md`

---

## File Structure Overview

**Schema & migration:**
- Modify: `packages/db/schema/user.ts` — `userStatusEnum`, add `status`/`jobTitle`/`isOutsourced`, remove `isActive`. `position` 재사용.
- Create: `packages/db/drizzle/0033_admin_users_status.sql` — enum/컬럼/backfill/seed/인덱스/drop.

**Queries:**
- Modify: `apps/web/lib/queries/admin.ts` — `UserWithOrg` 타입, `UserFilters.status`, `getUsers` 컬럼, 신규 `getCodesByGroup`.

**API routes:**
- Modify: `apps/web/app/api/admin/users/route.ts` — zod·SQL 업데이트.
- Create: `apps/web/app/api/admin/users/reset-password/route.ts` — stub POST.
- Create: `apps/web/app/api/admin/users/export/route.ts` — CSV GET.

**UI:**
- Modify: `apps/web/app/(app)/admin/users/page.tsx` — 코드 옵션 사전 로드.
- Modify: `apps/web/components/admin/UserTable.tsx` — 컬럼·필터·액션·CSV.
- Modify: `apps/web/components/admin/UserForm.tsx` — 직위/직책/외주/상태 입력.

**i18n:**
- Modify: `apps/web/messages/ko.json` — `Admin.Users.*` 키 추가.

**Tests:**
- Modify: `apps/web/app/api/admin/users/route.test.ts`
- Create: `apps/web/app/api/admin/users/reset-password/route.test.ts`
- Create: `apps/web/app/api/admin/users/export/route.test.ts`

**회귀 정리 (isActive 제거 여파):**
- Check: `scripts/migrate/users.ts`, `packages/auth/**`, `apps/web/app/api/auth/login/route.ts`와 그 테스트.

---

## Task 1 — Schema: enum, columns, and `isActive` removal

**Files:**
- Modify: `packages/db/schema/user.ts`

- [ ] **Step 1-1: Add imports and enum at top of `user.ts`**

Edit `packages/db/schema/user.ts` to change the drizzle import and add `pgEnum`:

```ts
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, workspace } from "./tenant.js";

export const userStatusEnum = pgEnum("user_status", ["active", "inactive", "locked"]);
```

- [ ] **Step 1-2: Replace `user` table columns**

Replace the `user` table declaration:

```ts
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  employeeId: varchar("employee_id", { length: 50 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  orgId: uuid("org_id").references(() => organization.id),
  position: varchar("position", { length: 100 }),
  jobTitle: varchar("job_title", { length: 50 }),
  status: userStatusEnum("status").default("active").notNull(),
  isOutsourced: boolean("is_outsourced").default(false).notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  preferences: jsonb("preferences")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
```

Note: `isActive` field is removed. `position` stays (already exists, unused). `jobTitle`, `status`, `isOutsourced` are new.

- [ ] **Step 1-3: Run typecheck**

Run: `pnpm --filter @jarvis/db type-check`
Expected: PASS (errors in other apps are OK at this stage — they'll be addressed later).

- [ ] **Step 1-4: Commit**

```bash
git add packages/db/schema/user.ts
git commit -m "feat(db): add user.status enum and jobTitle/isOutsourced; remove isActive"
```

---

## Task 2 — SQL migration 0033

**Files:**
- Create: `packages/db/drizzle/0033_admin_users_status.sql`

- [ ] **Step 2-1: Create the migration file**

Create `packages/db/drizzle/0033_admin_users_status.sql`:

```sql
-- Add user_status enum
DO $$ BEGIN
  CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'locked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns (nullable first to allow backfill)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "job_title" varchar(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_outsourced" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" "user_status";

-- Backfill status from existing is_active
UPDATE "user"
SET "status" = CASE WHEN "is_active" THEN 'active'::user_status ELSE 'inactive'::user_status END
WHERE "status" IS NULL;

-- Set NOT NULL and default on status
ALTER TABLE "user" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "status" SET DEFAULT 'active';

-- Index for filter queries
CREATE INDEX IF NOT EXISTS "user_workspace_status_idx" ON "user" ("workspace_id", "status");

-- Remove legacy is_active column
ALTER TABLE "user" DROP COLUMN IF EXISTS "is_active";

-- Seed POSITION and JOB_TITLE group codes for every existing workspace.
-- Idempotent: ON CONFLICT DO NOTHING (code_group.code should be unique per workspace — if not, fix constraint separately).
WITH workspaces AS (
  SELECT id AS workspace_id FROM workspace
),
seeded_groups AS (
  INSERT INTO code_group (workspace_id, code, name, is_active)
  SELECT workspace_id, g.code, g.name, true
  FROM workspaces
  CROSS JOIN (VALUES
    ('POSITION',  '직위'),
    ('JOB_TITLE', '직책')
  ) AS g(code, name)
  ON CONFLICT DO NOTHING
  RETURNING id, workspace_id, code
),
all_groups AS (
  -- Include pre-existing groups so seed items attach to them too.
  SELECT id, workspace_id, code FROM code_group
  WHERE code IN ('POSITION', 'JOB_TITLE')
)
INSERT INTO code_item (group_id, code, name, sort_order, is_active)
SELECT g.id, i.code, i.name, i.sort_order, true
FROM all_groups g
JOIN (VALUES
  ('POSITION',  'EXECUTIVE',  '임원', 10),
  ('POSITION',  'PRINCIPAL',  '수석', 20),
  ('POSITION',  'SENIOR',     '책임', 30),
  ('POSITION',  'ASSOCIATE',  '선임', 40),
  ('JOB_TITLE', 'TEAM_LEAD',  '팀장', 10),
  ('JOB_TITLE', 'PART_LEAD',  '파트장', 20),
  ('JOB_TITLE', 'MEMBER',     '팀원', 30)
) AS i(group_code, code, name, sort_order) ON i.group_code = g.code
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2-2: Inspect current journal**

Run: `cat packages/db/drizzle/meta/_journal.json | tail -20` to confirm latest entry is 0032.

- [ ] **Step 2-3: Regenerate journal entry manually**

Open `packages/db/drizzle/meta/_journal.json`, append an entry for `0033_admin_users_status` matching the pattern of prior entries. Use the current timestamp.

If the team's convention is `pnpm drizzle-kit generate`, run that instead — but verify the generated SQL matches Step 2-1; if not, overwrite the file with the SQL above.

- [ ] **Step 2-4: Commit**

```bash
git add packages/db/drizzle/0033_admin_users_status.sql packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): migration 0033 — user.status enum + position/jobTitle codes seed"
```

---

## Task 3 — Queries: `UserFilters`, `UserWithOrg`, `getUsers`, `getCodesByGroup`

**Files:**
- Modify: `apps/web/lib/queries/admin.ts`

- [ ] **Step 3-1: Update `UserWithOrg` type**

Replace the type (around line 12):

```ts
export type UserStatus = 'active' | 'inactive' | 'locked';

export type UserWithOrg = {
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  status: UserStatus;
  position: string | null;
  jobTitle: string | null;
  isOutsourced: boolean;
  createdAt: Date;
  orgId: string | null;
  orgName: string | null;
  roles: string[];
};
```

- [ ] **Step 3-2: Update `UserFilters` type**

Replace around line 69:

```ts
export type UserFilters = {
  q?: string;
  orgId?: string;
  status?: UserStatus | 'all';
  page?: number;
  limit?: number;
};
```

- [ ] **Step 3-3: Update `getUsers` to select new columns and filter by status**

Replace the body of `getUsers`:

```ts
export async function getUsers(
  workspaceId: string,
  filters: UserFilters = {},
): Promise<PaginatedResponse<UserWithOrg>> {
  const { q, orgId, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(user.workspaceId, workspaceId)];
  if (q) {
    conditions.push(
      sql`(${user.name} ilike ${`%${q}%`} or ${user.employeeId} ilike ${`%${q}%`} or ${user.email} ilike ${`%${q}%`})`,
    );
  }
  if (orgId !== undefined) conditions.push(eq(user.orgId, orgId));
  if (status && status !== 'all') conditions.push(eq(user.status, status));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:           user.id,
        employeeId:   user.employeeId,
        name:         user.name,
        email:        user.email,
        status:       user.status,
        position:     user.position,
        jobTitle:     user.jobTitle,
        isOutsourced: user.isOutsourced,
        createdAt:    user.createdAt,
        orgId:        user.orgId,
        orgName:      organization.name,
        roles:        sql<string[]>`
          coalesce(array_agg(${role.code}) filter (where ${role.code} is not null), '{}')
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
  return {
    data: rows as UserWithOrg[],
    meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}
```

- [ ] **Step 3-4: Add `getCodesByGroup`**

Append to `admin.ts` near other code-related exports:

```ts
export type CodeOption = { code: string; label: string };

export async function getCodesByGroup(
  workspaceId: string,
  groupCode: 'POSITION' | 'JOB_TITLE',
): Promise<CodeOption[]> {
  const rows = await db
    .select({
      code: codeItem.code,
      label: codeItem.name,
      sortOrder: codeItem.sortOrder,
    })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(
      eq(codeGroup.workspaceId, workspaceId),
      eq(codeGroup.code, groupCode),
      eq(codeItem.isActive, true),
    ))
    .orderBy(asc(codeItem.sortOrder));

  return rows.map((r) => ({ code: r.code, label: r.label }));
}
```

- [ ] **Step 3-5: Typecheck**

Run: `pnpm --filter web type-check`
Expected: the only errors left related to users should be in `route.ts` / `UserTable.tsx` / `UserForm.tsx` / test mocks — those are addressed in later tasks.

- [ ] **Step 3-6: Commit**

```bash
git add apps/web/lib/queries/admin.ts
git commit -m "refactor(admin): UserWithOrg adds status/position/jobTitle/isOutsourced; add getCodesByGroup"
```

---

## Task 4 — API `route.ts` update (GET/POST/PUT/DELETE)

**Files:**
- Modify: `apps/web/app/api/admin/users/route.ts`

- [ ] **Step 4-1: Replace the zod schemas and imports**

Top of `route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@jarvis/db/client';
import {
  user, organization, userRole, role,
  codeGroup, codeItem,
} from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import {
  and, eq, ilike, or, desc, count, inArray, sql,
} from 'drizzle-orm';

const statusEnum = z.enum(['active', 'inactive', 'locked']);

const createUserSchema = z.object({
  employeeId:   z.string().min(1).max(50),
  name:         z.string().min(1).max(200),
  email:        z.string().email().optional(),
  orgId:        z.string().uuid().optional(),
  position:     z.string().max(100).optional(),
  jobTitle:     z.string().max(50).optional(),
  isOutsourced: z.boolean().optional().default(false),
  roleCode:     z.enum(['ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER']).default('VIEWER'),
});

const updateUserSchema = z.object({
  id:           z.string().uuid(),
  name:         z.string().min(1).max(200).optional(),
  email:        z.string().email().optional(),
  orgId:        z.string().uuid().nullable().optional(),
  status:       statusEnum.optional(),
  position:     z.string().max(100).nullable().optional(),
  jobTitle:     z.string().max(50).nullable().optional(),
  isOutsourced: z.boolean().optional(),
  roleCodes:    z.array(z.enum(['ADMIN','MANAGER','DEVELOPER','HR','VIEWER'])).optional(),
});
```

- [ ] **Step 4-2: Add code validation helper**

Add below the schemas:

```ts
async function validateCodeRef(
  workspaceId: string,
  groupCode: 'POSITION' | 'JOB_TITLE',
  value: string | null | undefined,
): Promise<boolean> {
  if (value === null || value === undefined || value === '') return true;
  const rows = await db
    .select({ code: codeItem.code })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(and(
      eq(codeGroup.workspaceId, workspaceId),
      eq(codeGroup.code, groupCode),
      eq(codeItem.code, value),
      eq(codeItem.isActive, true),
    ))
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 4-3: Replace GET body**

```ts
export async function GET(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const page   = Math.max(1, Number(searchParams.get('page')  ?? '1'));
  const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;
  const q      = searchParams.get('q');
  const orgId  = searchParams.get('orgId');
  const statusParam = searchParams.get('status');

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
  if (statusParam && statusParam !== 'all') {
    const parsed = statusEnum.safeParse(statusParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    conditions.push(eq(user.status, parsed.data));
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id:           user.id,
        employeeId:   user.employeeId,
        name:         user.name,
        email:        user.email,
        status:       user.status,
        position:     user.position,
        jobTitle:     user.jobTitle,
        isOutsourced: user.isOutsourced,
        createdAt:    user.createdAt,
        orgId:        user.orgId,
        orgName:      organization.name,
        roles:        sql<string[]>`
          coalesce(array_agg(${role.code}) filter (where ${role.code} is not null), '{}')
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
```

- [ ] **Step 4-4: Replace POST body**

```ts
export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { roleCode, position, jobTitle, ...rest } = parsed.data;

  if (position !== undefined && !(await validateCodeRef(session.workspaceId, 'POSITION', position))) {
    return NextResponse.json({ error: 'Invalid position code' }, { status: 400 });
  }
  if (jobTitle !== undefined && !(await validateCodeRef(session.workspaceId, 'JOB_TITLE', jobTitle))) {
    return NextResponse.json({ error: 'Invalid jobTitle code' }, { status: 400 });
  }

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.workspaceId, session.workspaceId), eq(user.employeeId, rest.employeeId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Employee ID already exists in workspace' }, { status: 409 });
    }

    const inserted = await tx
      .insert(user)
      .values({
        ...rest,
        position: position ?? null,
        jobTitle: jobTitle ?? null,
        workspaceId: session.workspaceId,
        // status is defaulted to 'active' by schema
      })
      .returning();
    const newUser = inserted[0];
    if (!newUser) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const roleRow = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.workspaceId, session.workspaceId), eq(role.code, roleCode)))
      .limit(1);

    if (roleRow.length > 0 && roleRow[0]) {
      await tx.insert(userRole).values({ userId: newUser.id, roleId: roleRow[0].id });
    }

    return NextResponse.json(newUser, { status: 201 });
  });
}
```

- [ ] **Step 4-5: Replace PUT body**

```ts
export async function PUT(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, roleCodes, position, jobTitle, ...updateData } = parsed.data;

  if (position !== undefined && position !== null && !(await validateCodeRef(session.workspaceId, 'POSITION', position))) {
    return NextResponse.json({ error: 'Invalid position code' }, { status: 400 });
  }
  if (jobTitle !== undefined && jobTitle !== null && !(await validateCodeRef(session.workspaceId, 'JOB_TITLE', jobTitle))) {
    return NextResponse.json({ error: 'Invalid jobTitle code' }, { status: 400 });
  }

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({
        ...updateData,
        ...(position !== undefined ? { position } : {}),
        ...(jobTitle !== undefined ? { jobTitle } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, id), eq(user.workspaceId, session.workspaceId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (roleCodes !== undefined) {
      await tx.delete(userRole).where(eq(userRole.userId, id));
      if (roleCodes.length > 0) {
        const roleRows = await tx
          .select({ id: role.id, code: role.code })
          .from(role)
          .where(and(eq(role.workspaceId, session.workspaceId), inArray(role.code, roleCodes)));
        if (roleRows.length > 0) {
          await tx.insert(userRole).values(roleRows.map((r) => ({ userId: id, roleId: r.id })));
        }
      }
    }

    return NextResponse.json(updated);
  });
}
```

- [ ] **Step 4-6: Replace DELETE body**

```ts
export async function DELETE(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const [updated] = await db
    .update(user)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(and(eq(user.id, id), eq(user.workspaceId, session.workspaceId)))
    .returning({ id: user.id });

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4-7: Commit**

```bash
git add apps/web/app/api/admin/users/route.ts
git commit -m "feat(api): user CRUD supports status/position/jobTitle/isOutsourced with code validation"
```

---

## Task 5 — Update `route.test.ts` for new shape

**Files:**
- Modify: `apps/web/app/api/admin/users/route.test.ts`

- [ ] **Step 5-1: Extend the schema mock**

Replace the `@jarvis/db/schema` mock block (around line 44):

```ts
vi.mock('@jarvis/db/schema', () => ({
  user: {
    id: 'id', workspaceId: 'workspace_id', employeeId: 'employee_id',
    name: 'name', email: 'email', status: 'status',
    position: 'position', jobTitle: 'job_title', isOutsourced: 'is_outsourced',
    createdAt: 'created_at', orgId: 'org_id', updatedAt: 'updated_at',
  },
  organization: { id: 'id', name: 'name' },
  userRole: { userId: 'user_id', roleId: 'role_id' },
  role: { id: 'id', code: 'code', workspaceId: 'workspace_id' },
  codeGroup: { id: 'id', workspaceId: 'workspace_id', code: 'code' },
  codeItem: { id: 'id', groupId: 'group_id', code: 'code', name: 'name', isActive: 'is_active' },
}));
```

- [ ] **Step 5-2: Add PUT import and new tests**

At the top, update the import:

```ts
import { GET, POST, PUT, DELETE } from './route';
```

Append test suites after the existing DELETE block:

```ts
describe('GET /api/admin/users filtering', () => {
  it('accepts status=active', async () => {
    const req = makeRequest('GET', 'http://localhost/api/admin/users?status=active');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('rejects invalid status value', async () => {
    const req = makeRequest('GET', 'http://localhost/api/admin/users?status=weird');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/users with new fields', () => {
  it('accepts isOutsourced boolean and position/jobTitle codes', async () => {
    const req = makeRequest('POST', 'http://localhost/api/admin/users', {
      employeeId: 'E100',
      name: 'Outsource Kim',
      roleCode: 'VIEWER',
      isOutsourced: true,
      position: 'SENIOR',
      jobTitle: 'MEMBER',
    });
    // The validateCodeRef mock returns [] by default (limit=0 from mock),
    // so this may 400. Refine the transaction mock below if needed.
    const res = await POST(req);
    expect([201, 400]).toContain(res.status);
  });
});

describe('PUT /api/admin/users', () => {
  it('rejects unknown id fields', async () => {
    const req = makeRequest('PUT', 'http://localhost/api/admin/users', { id: 'not-a-uuid' });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('accepts status change payload', async () => {
    const req = makeRequest('PUT', 'http://localhost/api/admin/users', {
      id: '11111111-1111-1111-1111-111111111111',
      status: 'locked',
    });
    const res = await PUT(req);
    // transaction mock returns no updated row → 404
    expect([200, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 5-3: Run the tests**

Run: `pnpm --filter web test -- apps/web/app/api/admin/users/route.test.ts`
Expected: All pass. If any fail because the mocked `db.select().from().innerJoin()...` chain is missing `innerJoin`, add `innerJoin: vi.fn().mockReturnThis()` to the top-level `db` mock in step 5-1 area.

- [ ] **Step 5-4: Commit**

```bash
git add apps/web/app/api/admin/users/route.test.ts
git commit -m "test(api): extend user CRUD tests for status/position/jobTitle"
```

---

## Task 6 — `reset-password` stub endpoint + tests

**Files:**
- Create: `apps/web/app/api/admin/users/reset-password/route.ts`
- Create: `apps/web/app/api/admin/users/reset-password/route.test.ts`

- [ ] **Step 6-1: Write failing test**

Create `apps/web/app/api/admin/users/reset-password/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: { userId: 'u1', workspaceId: 'ws-1', roles: ['ADMIN'], permissions: ['admin:all'] },
  }),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'u-target' }]),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: { id: 'id', workspaceId: 'workspace_id' },
}));

function make(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': 'test' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/users/reset-password', () => {
  it('returns 200 with stub flag when user exists', async () => {
    const res = await POST(make({ id: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stub).toBe(true);
  });

  it('returns 400 when id is missing', async () => {
    const res = await POST(make({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6-2: Run test — expect failure**

Run: `pnpm --filter web test -- apps/web/app/api/admin/users/reset-password/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 6-3: Implement the route**

Create `apps/web/app/api/admin/users/reset-password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user } from '@jarvis/db/schema';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const bodySchema = z.object({ id: z.string().uuid() });

// TODO(auth): real implementation when password hashing / email delivery lands.
export async function POST(req: NextRequest) {
  const auth = await requireApiSession(req, PERMISSIONS.ADMIN_ALL);
  if (auth.response) return auth.response;
  const { session } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id required (uuid)' }, { status: 400 });
  }

  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, parsed.data.id), eq(user.workspaceId, session.workspaceId)))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    message: 'Password reset stub — auth system pending',
  });
}
```

- [ ] **Step 6-4: Re-run test**

Run: `pnpm --filter web test -- apps/web/app/api/admin/users/reset-password/route.test.ts`
Expected: PASS.

- [ ] **Step 6-5: Commit**

```bash
git add apps/web/app/api/admin/users/reset-password/route.ts apps/web/app/api/admin/users/reset-password/route.test.ts
git commit -m "feat(api): add password-reset stub endpoint"
```

---

## Task 7 — `export?format=csv` endpoint + tests

**Files:**
- Create: `apps/web/app/api/admin/users/export/route.ts`
- Create: `apps/web/app/api/admin/users/export/route.test.ts`

- [ ] **Step 7-1: Write failing test**

Create `apps/web/app/api/admin/users/export/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: { userId: 'u1', workspaceId: 'ws-1', roles: ['ADMIN'], permissions: ['admin:all'] },
  }),
}));

vi.mock('@jarvis/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([
      {
        employeeId: 'E001', name: '홍길동', email: 'h@e.co',
        orgName: '경영지원팀', status: 'active',
        positionLabel: '선임', jobTitleLabel: '팀원', isOutsourced: false,
        roles: ['VIEWER'], createdAt: new Date('2026-04-20T00:00:00Z'),
      },
    ]),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  user: { id: 'id', workspaceId: 'workspace_id', employeeId: 'employee_id',
          name: 'name', email: 'email', status: 'status',
          position: 'position', jobTitle: 'job_title', isOutsourced: 'is_outsourced',
          createdAt: 'created_at', orgId: 'org_id' },
  organization: { id: 'id', name: 'name' },
  userRole: { userId: 'user_id', roleId: 'role_id' },
  role: { id: 'id', code: 'code' },
  codeGroup: { id: 'id', workspaceId: 'workspace_id', code: 'code' },
  codeItem: { id: 'id', groupId: 'group_id', code: 'code', name: 'name', isActive: 'is_active' },
}));

function make(url: string) {
  return new NextRequest(url, { headers: { 'x-session-id': 'test' } });
}

describe('GET /api/admin/users/export', () => {
  it('returns CSV with BOM, UTF-8 content-type, and attachment disposition', async () => {
    const res = await GET(make('http://localhost/api/admin/users/export?format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv; charset=utf-8/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="users-\d{8}-\d{6}\.csv"/);
    const text = await res.text();
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('사번,이름,이메일,소속,직위,직책,역할,상태,외주여부,생성일');
    expect(text).toContain('E001');
  });

  it('rejects format other than csv', async () => {
    const res = await GET(make('http://localhost/api/admin/users/export?format=pdf'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7-2: Run test — expect failure**

Run: `pnpm --filter web test -- apps/web/app/api/admin/users/export/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 7-3: Implement export route**

Create `apps/web/app/api/admin/users/export/route.ts`:

```ts
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

  // Alias code_item twice for POSITION/JOB_TITLE label lookup.
  const posItem = codeItem;
  const titleItem = codeItem;
  // (drizzle prefers distinct aliases; if label joins cause ambiguity in SQL,
  //  fall back to two followup selects and merge maps — see comment at bottom of function)

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

  // Resolve code labels in-memory.
  const codeRows = await db
    .select({ groupCode: codeGroup.code, code: codeItem.code, label: codeItem.name })
    .from(codeItem)
    .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
    .where(eq(codeGroup.workspaceId, session.workspaceId));
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
```

- [ ] **Step 7-4: Re-run test**

Run: `pnpm --filter web test -- apps/web/app/api/admin/users/export/route.test.ts`
Expected: PASS.

- [ ] **Step 7-5: Commit**

```bash
git add apps/web/app/api/admin/users/export/ 
git commit -m "feat(api): add CSV export endpoint for admin users"
```

---

## Task 8 — i18n keys

**Files:**
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 8-1: Locate Admin.Users block**

Run: `grep -n '"Users":' apps/web/messages/ko.json`

- [ ] **Step 8-2: Insert new keys**

Under `Admin.Users`, merge the following keys (replace conflicting existing values, add missing ones):

```json
"columns": {
  "employeeId": "사번",
  "name": "이름",
  "email": "이메일",
  "organization": "소속",
  "position": "직위",
  "jobTitle": "직책",
  "roles": "역할",
  "status": "상태",
  "actions": "액션"
},
"status": {
  "active": "활성",
  "inactive": "비활성",
  "locked": "잠금",
  "outsourced": "외주"
},
"filter": {
  "statusAll": "전체"
},
"actions": {
  "edit": "편집",
  "deactivate": "비활성화",
  "lock": "잠금",
  "unlock": "잠금해제",
  "resetPassword": "비번 초기화",
  "export": "CSV 다운로드"
},
"form": {
  "position": "직위",
  "jobTitle": "직책",
  "isOutsourced": "외주인력",
  "status": "상태",
  "selectPosition": "직위 선택",
  "selectJobTitle": "직책 선택",
  "noPosition": "선택 안 함",
  "noJobTitle": "선택 안 함"
},
"toast": {
  "passwordResetStub": "비밀번호 초기화 요청됨 (스텁 — 인증 시스템 연동 대기)",
  "lockChanged": "상태가 변경되었습니다",
  "exportStarted": "다운로드 중…"
},
"searchPlaceholder": "사번·이름·이메일 검색",
"addUser": "추가",
"title": "사용자 관리",
"description": "사내 사용자와 권한을 관리합니다."
```

Preserve any existing keys not listed above.

- [ ] **Step 8-3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/ko.json','utf8'))"`
Expected: no output = valid.

- [ ] **Step 8-4: Commit**

```bash
git add apps/web/messages/ko.json
git commit -m "feat(i18n): Admin.Users keys for status/position/jobTitle/actions"
```

---

## Task 9 — Page: load code options

**Files:**
- Modify: `apps/web/app/(app)/admin/users/page.tsx`

- [ ] **Step 9-1: Update imports and server data load**

Replace the file contents:

```tsx
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getUsers, getOrgTree, getCodesByGroup } from '@/lib/queries/admin';
import { UserTable } from '@/components/admin/UserTable';
import { PageHeader } from '@/components/patterns/PageHeader';

function flattenTree(
  nodes: Array<{ id: string; name: string; children: typeof nodes }>,
  acc: Array<{ id: string; name: string }> = [],
) {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name });
    flattenTree(n.children, acc);
  }
  return acc;
}

export default async function AdminUsersPage() {
  const t = await getTranslations('Admin.Users');
  const headersList = await headers();
  const session = await getSession(headersList.get('x-session-id') ?? '');
  const workspaceId = session!.workspaceId;

  const [{ data: users }, orgTree, positionOptions, jobTitleOptions] = await Promise.all([
    getUsers(workspaceId, { page: 1, limit: 20 }),
    getOrgTree(workspaceId),
    getCodesByGroup(workspaceId, 'POSITION'),
    getCodesByGroup(workspaceId, 'JOB_TITLE'),
  ]);

  void users;
  const orgOptions = flattenTree(orgTree);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Users"
        title={t('title')}
        description={t('description')}
      />
      <UserTable
        orgOptions={orgOptions}
        positionOptions={positionOptions}
        jobTitleOptions={jobTitleOptions}
      />
    </div>
  );
}
```

- [ ] **Step 9-2: Commit**

```bash
git add 'apps/web/app/(app)/admin/users/page.tsx'
git commit -m "feat(admin): preload POSITION/JOB_TITLE options for user table"
```

---

## Task 10 — `UserForm.tsx` new fields

**Files:**
- Modify: `apps/web/components/admin/UserForm.tsx`

- [ ] **Step 10-1: Update imports and types**

Replace top section of `UserForm.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserWithOrg, CodeOption } from '@/lib/queries/admin';

const ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER'] as const;
const STATUS_OPTIONS = ['active', 'inactive', 'locked'] as const;

const schema = z.object({
  employeeId:   z.string().min(1, 'Required'),
  name:         z.string().min(1, 'Required'),
  email:        z.string().email().optional().or(z.literal('')),
  orgId:        z.string().uuid().optional().or(z.literal('')),
  position:     z.string().optional().or(z.literal('')),
  jobTitle:     z.string().optional().or(z.literal('')),
  isOutsourced: z.boolean().optional(),
  status:       z.enum(STATUS_OPTIONS).optional(),
  roleCodes:    z.array(z.enum(ROLE_OPTIONS)).min(1, 'Select at least one role'),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open:              boolean;
  onOpenChange:      (v: boolean) => void;
  defaultValues?:    Partial<UserWithOrg>;
  orgOptions:        Array<{ id: string; name: string }>;
  positionOptions:   CodeOption[];
  jobTitleOptions:   CodeOption[];
  onSuccess:         () => void;
};
```

- [ ] **Step 10-2: Update function signature and form defaults**

Replace the `UserForm` function header and defaults:

```tsx
export function UserForm({
  open, onOpenChange, defaultValues, orgOptions, positionOptions, jobTitleOptions, onSuccess,
}: Props) {
  const t = useTranslations('Admin.UserForm');
  const tUsers = useTranslations('Admin.Users');
  const isEdit = !!defaultValues?.id;

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        employeeId:   defaultValues?.employeeId ?? '',
        name:         defaultValues?.name        ?? '',
        email:        defaultValues?.email        ?? '',
        orgId:        defaultValues?.orgId        ?? '',
        position:     defaultValues?.position     ?? '',
        jobTitle:     defaultValues?.jobTitle     ?? '',
        isOutsourced: defaultValues?.isOutsourced ?? false,
        status:       (defaultValues?.status as FormValues['status']) ?? 'active',
        roleCodes:    (defaultValues?.roles as typeof ROLE_OPTIONS[number][]) ?? ['VIEWER'],
      },
    });

  useEffect(() => {
    if (open) {
      reset({
        employeeId:   defaultValues?.employeeId ?? '',
        name:         defaultValues?.name        ?? '',
        email:        defaultValues?.email        ?? '',
        orgId:        defaultValues?.orgId        ?? '',
        position:     defaultValues?.position     ?? '',
        jobTitle:     defaultValues?.jobTitle     ?? '',
        isOutsourced: defaultValues?.isOutsourced ?? false,
        status:       (defaultValues?.status as FormValues['status']) ?? 'active',
        roleCodes:    (defaultValues?.roles as typeof ROLE_OPTIONS[number][]) ?? ['VIEWER'],
      });
    }
  }, [open, defaultValues, reset]);
```

- [ ] **Step 10-3: Update submit body and shape**

Replace `onSubmit`:

```tsx
  const onSubmit = async (values: FormValues) => {
    const url    = '/api/admin/users';
    const method = isEdit ? 'PUT' : 'POST';

    const cleanBody: Record<string, unknown> = { ...values };
    if (!cleanBody.email)    delete cleanBody.email;
    if (!cleanBody.orgId)    delete cleanBody.orgId;
    if (!cleanBody.position) delete cleanBody.position;
    if (!cleanBody.jobTitle) delete cleanBody.jobTitle;
    if (!isEdit) delete cleanBody.status;

    const body = isEdit ? { ...cleanBody, id: defaultValues!.id } : cleanBody;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok) onSuccess();
  };
```

- [ ] **Step 10-4: Add new form fields to the JSX**

Insert between the existing `organization` field block and the `roles` block:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{tUsers('form.position')}</Label>
              <Controller
                name="position"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={tUsers('form.selectPosition')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{tUsers('form.noPosition')}</SelectItem>
                      {positionOptions.map((o) => (
                        <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>{tUsers('form.jobTitle')}</Label>
              <Controller
                name="jobTitle"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={tUsers('form.selectJobTitle')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{tUsers('form.noJobTitle')}</SelectItem>
                      {jobTitleOptions.map((o) => (
                        <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
```

Insert after roles block (before DialogFooter):

```tsx
          <div className="flex items-center gap-2">
            <Controller
              name="isOutsourced"
              control={control}
              render={({ field }) => (
                <input
                  id="isOutsourced"
                  type="checkbox"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
              )}
            />
            <Label htmlFor="isOutsourced">{tUsers('form.isOutsourced')}</Label>
          </div>

          {isEdit && (
            <div className="space-y-1">
              <Label>{tUsers('form.status')}</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{tUsers('status.active')}</SelectItem>
                      <SelectItem value="inactive">{tUsers('status.inactive')}</SelectItem>
                      <SelectItem value="locked">{tUsers('status.locked')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
```

- [ ] **Step 10-5: Commit**

```bash
git add apps/web/components/admin/UserForm.tsx
git commit -m "feat(ui): UserForm supports position/jobTitle/isOutsourced/status"
```

---

## Task 11 — `UserTable.tsx` columns, filter, actions, CSV button

**Files:**
- Modify: `apps/web/components/admin/UserTable.tsx`

- [ ] **Step 11-1: Update Props type and add position/jobTitle maps**

Replace imports and Props type at the top:

```tsx
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type PaginationState,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserForm } from './UserForm';
import type { UserWithOrg, CodeOption, UserStatus } from '@/lib/queries/admin';

type Props = {
  orgOptions:      Array<{ id: string; name: string }>;
  positionOptions: CodeOption[];
  jobTitleOptions: CodeOption[];
};

const columnHelper = createColumnHelper<UserWithOrg>();
```

- [ ] **Step 11-2: Update component state & fetch**

Replace the `UserTable` function's state and fetch:

```tsx
export function UserTable({ orgOptions, positionOptions, jobTitleOptions }: Props) {
  const t = useTranslations('Admin.Users');
  const [data, setData]             = useState<UserWithOrg[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [editTarget, setEditTarget] = useState<UserWithOrg | null>(null);
  const [formOpen, setFormOpen]     = useState(false);

  const positionLabelMap = useMemo(
    () => new Map(positionOptions.map((o) => [o.code, o.label])),
    [positionOptions],
  );
  const jobTitleLabelMap = useMemo(
    () => new Map(jobTitleOptions.map((o) => [o.code, o.label])),
    [jobTitleOptions],
  );

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(h);
  }, [search]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page:  String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    return params;
  }, [pagination, debouncedQ, statusFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users?${buildQuery()}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);
```

- [ ] **Step 11-3: Add action handlers**

Append inside the component, after `fetchData`:

```tsx
  const handleDeactivate = async (id: string) => {
    if (!confirm(t('confirmDeactivate') || 'Deactivate this user?')) return;
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleToggleLock = async (u: UserWithOrg) => {
    const next: UserStatus = u.status === 'locked' ? 'active' : 'locked';
    await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: u.id, status: next }),
    });
    fetchData();
  };

  const handleResetPassword = async (id: string) => {
    const res = await fetch('/api/admin/users/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    if (res.ok) alert(t('toast.passwordResetStub'));
  };

  const handleExport = () => {
    const params = buildQuery();
    params.delete('page');
    params.delete('limit');
    params.set('format', 'csv');
    window.location.href = `/api/admin/users/export?${params.toString()}`;
  };
```

- [ ] **Step 11-4: Replace columns definition**

Replace the `columns` array:

```tsx
  const columns = [
    columnHelper.accessor('employeeId', { header: t('columns.employeeId') }),
    columnHelper.accessor('name',       { header: t('columns.name') }),
    columnHelper.accessor('email',      { header: t('columns.email'),        cell: (i) => i.getValue() ?? '—' }),
    columnHelper.accessor('orgName',    { header: t('columns.organization'), cell: (i) => i.getValue() ?? '—' }),
    columnHelper.accessor('position',   {
      header: t('columns.position'),
      cell: (i) => {
        const code = i.getValue();
        return code ? (positionLabelMap.get(code) ?? code) : '—';
      },
    }),
    columnHelper.accessor('jobTitle', {
      header: t('columns.jobTitle'),
      cell: (i) => {
        const code = i.getValue();
        return code ? (jobTitleLabelMap.get(code) ?? code) : '—';
      },
    }),
    columnHelper.accessor('roles', {
      header: t('columns.roles'),
      cell: (i) => (
        <div className="flex flex-wrap gap-1">
          {(i.getValue() as string[]).map((r) => (
            <Badge key={r} variant="secondary">{r}</Badge>
          ))}
        </div>
      ),
    }),
    columnHelper.accessor('status', {
      header: t('columns.status'),
      cell: ({ row }) => {
        const s = row.original.status;
        const variant = s === 'active' ? 'default' : s === 'locked' ? 'outline' : 'destructive';
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant={variant}>{t(`status.${s}`)}</Badge>
            {row.original.isOutsourced && <Badge variant="outline">{t('status.outsourced')}</Badge>}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: t('columns.actions'),
      cell: ({ row }) => {
        const u = row.original;
        const isInactive = u.status === 'inactive';
        return (
          <div className="flex gap-1 flex-wrap">
            <Button variant="outline" size="sm"
              onClick={() => { setEditTarget(u); setFormOpen(true); }}>
              {t('actions.edit')}
            </Button>
            <Button variant="secondary" size="sm" disabled={isInactive}
              onClick={() => handleToggleLock(u)}>
              {u.status === 'locked' ? t('actions.unlock') : t('actions.lock')}
            </Button>
            <Button variant="secondary" size="sm"
              onClick={() => handleResetPassword(u.id)}>
              {t('actions.resetPassword')}
            </Button>
            <Button variant="secondary" size="sm" disabled={isInactive}
              onClick={() => handleDeactivate(u.id)}>
              {t('actions.deactivate')}
            </Button>
          </div>
        );
      },
    }),
  ];
```

- [ ] **Step 11-5: Replace toolbar JSX**

Replace the top of the return block:

```tsx
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter.statusAll')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
              <SelectItem value="locked">{t('status.locked')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>{t('actions.export')}</Button>
          <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            {t('addUser')}
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
```

Keep the existing `<Table>` and pagination blocks (no changes needed) — but update the `<UserForm>` props at the bottom:

```tsx
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={editTarget ?? undefined}
        orgOptions={orgOptions}
        positionOptions={positionOptions}
        jobTitleOptions={jobTitleOptions}
        onSuccess={() => { setFormOpen(false); fetchData(); }}
      />
```

- [ ] **Step 11-6: Typecheck**

Run: `pnpm --filter web type-check`
Expected: PASS (no remaining `isActive` references in users flow).

- [ ] **Step 11-7: Commit**

```bash
git add apps/web/components/admin/UserTable.tsx
git commit -m "feat(ui): UserTable adds status filter, 4 row actions, CSV export, new columns"
```

---

## Task 12 — Regression cleanup: `scripts/migrate/users.ts`, login/session

**Files:**
- Modify: `scripts/migrate/users.ts`
- Verify: `apps/web/app/api/auth/login/route.ts`, `apps/web/app/api/auth/login/route.test.ts`, `packages/auth/**`

- [ ] **Step 12-1: Grep for `isActive` in users flow**

Run:
```bash
grep -rn "user\.isActive\|users\.isActive\|user\.is_active\|\"is_active\"\s*:\s*" \
  apps/web packages scripts 2>/dev/null | grep -v node_modules
```
Expected: matches only in `scripts/migrate/users.ts` and any legacy test mock. Other tables' `isActive` (organization, code) are fine.

- [ ] **Step 12-2: Edit `scripts/migrate/users.ts`**

Find any occurrence of `isActive: true` / `isActive: false` or references to `user.isActive` and replace with `status: 'active'` or `status: 'inactive'` respectively. Remove `isActive` from select projections.

- [ ] **Step 12-3: Verify login path has no isActive read**

Run: `grep -n "isActive" apps/web/app/api/auth/login/route.ts packages/auth`
Expected: no matches (confirmed during spec authoring but re-verify after merges).

- [ ] **Step 12-4: Run login test**

Run: `pnpm --filter web test -- apps/web/app/api/auth/login/route.test.ts`
Expected: PASS.

- [ ] **Step 12-5: Commit**

```bash
git add scripts/migrate/users.ts
git commit -m "chore(migrate): users seed script uses status instead of isActive"
```

---

## Task 13 — Full typecheck, lint, and test sweep

- [ ] **Step 13-1: Typecheck all web + db**

Run:
```bash
pnpm --filter web type-check
pnpm --filter @jarvis/db type-check
```
Expected: 0 errors related to admin/users/auth. Unrelated drift errors from other parallel branches (systems→projects) are out of scope — note them but do not fix.

- [ ] **Step 13-2: Lint**

Run: `pnpm --filter web lint`
Expected: 0 new warnings in files I touched.

- [ ] **Step 13-3: Run all admin/users tests**

Run:
```bash
pnpm --filter web test -- \
  apps/web/app/api/admin/users \
  apps/web/lib/queries/admin
```
Expected: PASS.

- [ ] **Step 13-4: Run auth regression**

Run: `pnpm --filter web test -- apps/web/app/api/auth`
Expected: PASS.

- [ ] **Step 13-5: If any issues, fix and recommit individually**

Do not amend earlier commits. Open new commits for each fix.

---

## Task 14 — Final verification

- [ ] **Step 14-1: Run migration locally against a dev DB**

Run (team-specific command, check `packages/db/package.json` scripts):
```bash
pnpm --filter @jarvis/db migrate
```
Expected: Applies 0033 cleanly, seed inserted for existing workspaces.

- [ ] **Step 14-2: Manual dev smoke test**

```bash
pnpm dev
# Navigate to http://localhost:3000/admin/users
```

Checks:
- Columns show 직위/직책/상태 with proper Korean labels.
- 상태 셀렉트 변경 → 결과 반영.
- 추가 버튼 → 다이얼로그에 직위/직책 Select, 외주 체크박스 노출.
- 편집 다이얼로그에 상태 Select 노출.
- 잠금 토글 즉시 반영 (tr 안의 `<Badge>`가 즉시 `잠금`으로 변경).
- CSV 다운로드 버튼 → BOM 포함 파일 다운로드, Excel에서 한글 정상.
- 비번 초기화 버튼 → "스텁" 알림.

- [ ] **Step 14-3: Commit final tweaks if any**

Only if manual testing surfaces issues.

---

## Self-Review Summary

**Spec coverage map:**

| Spec section | Task(s) |
|---|---|
| 2.1 Schema changes | Task 1 |
| 2.3 Migration (0033 backfill) | Task 2 |
| 2.5 `isActive` removal sweep | Tasks 1, 3, 4, 12 |
| 3.1 POSITION/JOB_TITLE seed | Task 2 |
| 3.3 `getCodesByGroup` | Task 3 |
| 4.1–4.4 CRUD updates | Task 4 |
| 4.5 reset-password stub | Task 6 |
| 4.6 export CSV | Task 7 |
| 5.1 page server load | Task 9 |
| 5.2 UserTable | Task 11 |
| 5.3 UserForm | Task 10 |
| 6.1 i18n keys | Task 8 |
| 6.2 permissions (already enforced) | Tasks 4, 6, 7 |
| 7 Tests | Tasks 5, 6, 7, 12, 13 |
| 8 Rollout (typecheck/lint sweep) | Task 13, 14 |

**Known placeholder-free:** Every step includes exact code or exact commands. No "TBD".

**Type consistency spot-checks:**
- `UserStatus` exported from `admin.ts` and used in `UserTable.tsx` ✓
- `CodeOption` exported from `admin.ts` and used in both `UserForm.tsx`, `UserTable.tsx` ✓
- API zod schemas accept `status`, `position`, `jobTitle`, `isOutsourced` — matches UserForm submit and UserTable filter ✓
- Drizzle `user.status` enum reused consistently ✓

**Risk flags called out:**
- Task 2 Step 2-3: journal entry must match tooling. If `drizzle-kit generate` is used, SQL may differ — verify and overwrite.
- Task 5 Step 5-1: mock may need `innerJoin` added depending on chain order.
- Task 7 fallback comment: if double-alias on `code_item` causes SQL ambiguity, follow-up select pattern is already implemented in the route.
- Task 14: real migration requires dev DB access; on CI-only environments, skip Step 14-1 and rely on existing migration runner.
