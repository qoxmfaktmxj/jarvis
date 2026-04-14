# Auth & Permission Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 verified bugs — role case mismatch (kills all permissions), missing files:write permission, ask API auth gap, search sort mismatch, env var gaps, and MinIO hardcode.

**Architecture:** Root cause is a single case-mismatch between DB role codes (lowercase) and ROLE_PERMISSIONS keys (uppercase). Fixing the callback normalizer + seed propagates through ask.ts, Admin API, and UserForm automatically. Remaining tasks are independent surgical fixes.

**Tech Stack:** Next.js 15, Drizzle ORM, PostgreSQL, pg-boss, Zod, Vitest

---

## File Map

| File | Change |
|------|--------|
| `apps/web/app/api/auth/callback/route.ts` | normalize roleCode to uppercase in session |
| `packages/db/seed/dev.ts` | uppercase role codes + correct pageType per page |
| `packages/shared/constants/permissions.ts` | add FILES_WRITE, assign to ADMIN/MANAGER/DEVELOPER |
| `apps/web/app/api/ask/route.ts` | add KNOWLEDGE_READ permission check |
| `packages/search/types.ts` | update SearchSortBy to match validation schema |
| `packages/search/pg-search.ts` | update buildOrderBy to handle all 4 sort values |
| `.env.example` | add OPENAI_API_KEY |
| `apps/worker/src/lib/minio-client.ts` | read BUCKET from MINIO_BUCKET env var |

---

## Task 1 — Role Code Case Normalization (Critical)

**Root cause:** `ROLE_PERMISSIONS` has uppercase keys (`ADMIN`, `DEVELOPER`). DB seed inserts lowercase (`admin`, `developer`). Callback maps DB values directly → all `ROLE_PERMISSIONS[roleCode]` lookups return `undefined` → every user gets `permissions: []`.

**Files:**
- Modify: `apps/web/app/api/auth/callback/route.ts:60`
- Modify: `packages/db/seed/dev.ts:44-50` (roles insert)
- Modify: `packages/db/seed/dev.ts:146` (pageType values)

- [ ] **Step 1: Fix callback to normalize roleCode to uppercase**

In `apps/web/app/api/auth/callback/route.ts`, change line 60:

```typescript
// BEFORE (line 60):
const roles = userRoleRows.map((row) => row.roleCode);

// AFTER:
const roles = userRoleRows.map((row) => row.roleCode.toUpperCase());
```

The resulting session will have `roles: ['ADMIN']` instead of `['admin']`, making `ROLE_PERMISSIONS['ADMIN']` resolve correctly and fixing `ask.ts` line 24 (`userRoles.includes('ADMIN')`) and `pg-search.ts` `buildSecretFilter` simultaneously.

- [ ] **Step 2: Fix seed role codes to uppercase**

In `packages/db/seed/dev.ts`, replace the roles insert block (lines 43–51):

```typescript
// BEFORE:
const roles = await db
  .insert(role)
  .values([
    { workspaceId: wsId, code: 'admin', name: 'Admin' },
    { workspaceId: wsId, code: 'editor', name: 'Editor' },
    { workspaceId: wsId, code: 'viewer', name: 'Viewer' },
    { workspaceId: wsId, code: 'developer', name: 'Developer' },
    { workspaceId: wsId, code: 'manager', name: 'Manager' },
  ])
  .returning();

// AFTER:
const roles = await db
  .insert(role)
  .values([
    { workspaceId: wsId, code: 'ADMIN', name: 'Admin' },
    { workspaceId: wsId, code: 'MANAGER', name: 'Manager' },
    { workspaceId: wsId, code: 'VIEWER', name: 'Viewer' },
    { workspaceId: wsId, code: 'DEVELOPER', name: 'Developer' },
    { workspaceId: wsId, code: 'HR', name: 'HR' },
  ])
  .returning();
```

Note: `editor` → `MANAGER` (closest match with write access). `HR` replaces the dropped `editor` slot functionally.

- [ ] **Step 3: Fix seed user role assignments (line 54 destructuring)**

The destructuring on line 54 assigns `editorRole` but is now the MANAGER role. Rename for clarity:

```typescript
// BEFORE:
const [adminRole, editorRole, viewerRole] = roles as [typeof roles[0], typeof roles[0], typeof roles[0]];

// AFTER:
const [adminRole, managerRole, viewerRole] = roles as [typeof roles[0], typeof roles[0], typeof roles[0]];
```

And update userRole assignments (lines 57–61):

```typescript
// BEFORE:
await db.insert(userRole).values([
  { userId: adminUser.id, roleId: adminRole.id },
  { userId: aliceUser.id, roleId: editorRole.id },
  { userId: bobUser.id, roleId: viewerRole.id },
]);

// AFTER:
await db.insert(userRole).values([
  { userId: adminUser.id, roleId: adminRole.id },
  { userId: aliceUser.id, roleId: managerRole.id },
  { userId: bobUser.id, roleId: viewerRole.id },
]);
```

- [ ] **Step 4: Fix seed pageType values (lines 144–151)**

Each knowledge page has `pageType: 'article'` which is not in `PAGE_TYPES`. Replace with correct types:

```typescript
// BEFORE (inside the for loop at line 144):
.values({
  workspaceId: wsId,
  pageType: 'article',
  ...

// AFTER — change the loop to use per-item pageType:
// Replace the knowledgeData array (lines 118–139) to include pageType:
const knowledgeData = [
  {
    title: 'Employee Onboarding Guide',
    pageType: 'onboarding' as const,
    mdx: '# Employee Onboarding Guide\n\nWelcome to Jarvis! This guide walks you through your first week.\n\n## Day 1\n\nSet up your workstation and review the company handbook.\n\n## Day 2-5\n\nMeet your team, complete compliance training, and get access to all required systems.',
  },
  {
    title: 'HR Policies Overview',
    pageType: 'hr-policy' as const,
    mdx: '# HR Policies\n\n## Leave Policy\n\nAll full-time employees receive 20 days of paid annual leave.\n\n## Remote Work\n\nRemote work is allowed up to 3 days per week with manager approval.',
  },
  {
    title: 'Development Tools & Setup',
    pageType: 'tool-guide' as const,
    mdx: '# Development Tools\n\n## Required Software\n\n- Node.js 22\n- pnpm 9\n- Docker Desktop\n- VS Code or Cursor\n\n## Repository Access\n\nRequest access to the jarvis GitHub org from your manager.',
  },
  {
    title: 'FAQ: Common Questions',
    pageType: 'faq' as const,
    mdx: '# Frequently Asked Questions\n\n## How do I reset my password?\n\nVisit /auth/reset and follow the instructions.\n\n## Who do I contact for IT support?\n\nEmail it@jarvis.dev or open a ticket in the portal.',
  },
  {
    title: 'Glossary of Terms',
    pageType: 'glossary' as const,
    mdx: '# Glossary\n\n**RAG** — Retrieval-Augmented Generation. AI technique combining search with LLM generation.\n\n**pgvector** — PostgreSQL extension for vector similarity search.\n\n**MDX** — Markdown with JSX components embedded.',
  },
];
```

Then update the insert call to use `kd.pageType` instead of hardcoded `'article'`:

```typescript
// BEFORE (line 144):
.values({
  workspaceId: wsId,
  pageType: 'article',
  title: kd.title,

// AFTER:
.values({
  workspaceId: wsId,
  pageType: kd.pageType,
  title: kd.title,
```

- [ ] **Step 5: Commit**

```bash
cd C:/Users/kms/Desktop/dev/jarvis
git add apps/web/app/api/auth/callback/route.ts packages/db/seed/dev.ts
git commit -m "fix: normalize role codes to uppercase — fixes empty permissions for all users"
```

---

## Task 2 — Add FILES_WRITE Permission (Critical)

**Problem:** `/api/upload` and `/api/upload/presign` require `'files:write'` permission, but this string doesn't exist in `PERMISSIONS` constant or any `ROLE_PERMISSIONS` entry. All file uploads return 403.

**Files:**
- Modify: `packages/shared/constants/permissions.ts`

- [ ] **Step 1: Add FILES_WRITE to PERMISSIONS constant**

In `packages/shared/constants/permissions.ts`, add to the PERMISSIONS object after `AUDIT_READ` (line 27):

```typescript
// BEFORE (lines 25-29):
  USER_READ: "admin:users:read",
  USER_WRITE: "admin:users:write",
  AUDIT_READ: "admin:audit:read",
  ADMIN_ALL: "admin:all"
} as const;

// AFTER:
  USER_READ: "admin:users:read",
  USER_WRITE: "admin:users:write",
  AUDIT_READ: "admin:audit:read",
  ADMIN_ALL: "admin:all",
  FILES_WRITE: "files:write"
} as const;
```

- [ ] **Step 2: Assign FILES_WRITE to appropriate roles**

In `ROLE_PERMISSIONS`, add `PERMISSIONS.FILES_WRITE` to `ADMIN` (already gets all via `Object.values`), `MANAGER`, and `DEVELOPER`:

```typescript
// BEFORE — MANAGER array (lines 35-49):
  MANAGER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.KNOWLEDGE_REVIEW,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.SYSTEM_CREATE,
    PERMISSIONS.SYSTEM_UPDATE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_ADMIN,
    PERMISSIONS.USER_READ
  ],

// AFTER:
  MANAGER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.KNOWLEDGE_REVIEW,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.SYSTEM_CREATE,
    PERMISSIONS.SYSTEM_UPDATE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_ADMIN,
    PERMISSIONS.USER_READ,
    PERMISSIONS.FILES_WRITE
  ],
```

```typescript
// BEFORE — DEVELOPER array (lines 50-61):
  DEVELOPER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.SYSTEM_ACCESS_SECRET,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE
  ],

// AFTER:
  DEVELOPER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_CREATE,
    PERMISSIONS.KNOWLEDGE_UPDATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.SYSTEM_ACCESS_SECRET,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.FILES_WRITE
  ],
```

(`ADMIN` gets it automatically via `Object.values(PERMISSIONS)`.)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/constants/permissions.ts
git commit -m "fix: add FILES_WRITE permission — unblocks file upload endpoints"
```

---

## Task 3 — Add Permission Check to Ask API (Medium)

**Problem:** `/api/ask` only checks session existence. After Task 1 fixes permissions, ask should enforce `KNOWLEDGE_READ` like the search route does.

**Files:**
- Modify: `apps/web/app/api/ask/route.ts`

- [ ] **Step 1: Replace manual session check with requireApiSession**

In `apps/web/app/api/ask/route.ts`, replace lines 1–33 (imports + auth block):

```typescript
// BEFORE (imports + auth block, lines 1-33):
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@jarvis/auth/session';
import { getRedis } from '@jarvis/db/redis';
import { askAI } from '@jarvis/ai/ask';
import type { SSEEvent } from '@jarvis/ai/types';

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
});

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600;

function rateLimitKey(userId: string): string {
  return `ratelimit:ask:${userId}`;
}

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  // 1. Auth
  const sessionId = request.cookies.get('sessionId')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

// AFTER:
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRedis } from '@jarvis/db/redis';
import { askAI } from '@jarvis/ai/ask';
import type { SSEEvent } from '@jarvis/ai/types';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
});

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600;

function rateLimitKey(userId: string): string {
  return `ratelimit:ask:${userId}`;
}

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  // 1. Auth + permission check
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) {
    return new Response(auth.response.body, {
      status: auth.response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { session } = auth;
```

- [ ] **Step 2: Verify session.userId usage is unchanged**

The rest of the function uses `session.userId`, `session.workspaceId`, `session.roles` — these are all present on `JarvisSession`. No further changes needed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/ask/route.ts
git commit -m "fix: require KNOWLEDGE_READ permission for Ask AI API"
```

---

## Task 4 — Unify Search Sort Enum (Medium)

**Problem:** `packages/shared/validation/search.ts` defines `sort: z.enum(["relevance", "newest", "freshness", "hybrid"])` but `packages/search/types.ts` has `SearchSortBy = 'relevance' | 'date' | 'popularity'` and `buildOrderBy` in `pg-search.ts` handles `'date'` and `'popularity'` — none of the validation schema's values except `'relevance'`. API clients send `"newest"` and get relevance ordering; `"hybrid"` falls through to the same.

**Files:**
- Modify: `packages/search/types.ts` — update SearchSortBy type
- Modify: `packages/search/pg-search.ts` — update buildOrderBy to handle all 4 values

- [ ] **Step 1: Update SearchSortBy type in search/types.ts**

```typescript
// BEFORE (line 1):
export type SearchSortBy = 'relevance' | 'date' | 'popularity';

// AFTER:
export type SearchSortBy = 'relevance' | 'newest' | 'freshness' | 'hybrid';
```

- [ ] **Step 2: Update buildOrderBy in pg-search.ts**

Replace `buildOrderBy` method (lines 384–405):

```typescript
// BEFORE:
private buildOrderBy(sortBy: string): string {
  switch (sortBy) {
    case 'date':
      return 'updated_at DESC';
    case 'popularity':
      return 'updated_at DESC';
    case 'relevance':
    default:
      return `
        (
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END * 0.1
        ) DESC
      `;
  }
}

// AFTER:
private buildOrderBy(sortBy: string): string {
  switch (sortBy) {
    case 'newest':
      return 'updated_at DESC';
    case 'freshness':
      return `
        CASE
          WHEN updated_at > now() - interval '7 days' THEN 1.0
          WHEN updated_at > now() - interval '30 days' THEN 0.8
          WHEN updated_at > now() - interval '90 days' THEN 0.5
          ELSE 0.2
        END DESC
      `;
    case 'relevance':
      return 'fts_rank DESC, trgm_sim DESC';
    case 'hybrid':
    default:
      // Hybrid: weight fts_rank (60%) + freshness bonus (40%)
      return `
        (
          ts_rank_cd(search_vector, plainto_tsquery('simple', '')) * 0.6 +
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END * 0.4
        ) DESC
      `;
  }
}
```

Note: The `'hybrid'` ORDER BY can't easily reference the already-computed `fts_rank` alias in PostgreSQL's ORDER BY when using `sql.raw`. The approximation above is consistent with what the code already does for the default case. The real hybrid score is computed post-query in `mapRowToHit` for display — this ORDER BY is a close approximation.

Actually, since `fts_rank` IS a selected alias in the query's SELECT list, PostgreSQL allows referencing it in ORDER BY. Use it:

```typescript
    case 'hybrid':
    default:
      return `
        (
          fts_rank * 0.6 +
          CASE
            WHEN updated_at > now() - interval '7 days' THEN 1.0
            WHEN updated_at > now() - interval '30 days' THEN 0.8
            WHEN updated_at > now() - interval '90 days' THEN 0.5
            ELSE 0.2
          END * 0.4
        ) DESC
      `;
```

- [ ] **Step 3: Commit**

```bash
git add packages/search/types.ts packages/search/pg-search.ts
git commit -m "fix: align search sort enum — newest/freshness/relevance/hybrid now work correctly"
```

---

## Task 5 — Environment Variables & MinIO (Low)

**Problem A:** `OPENAI_API_KEY` is missing from `.env.example` but the worker's embed job reads `process.env['OPENAI_API_KEY']`. New developers get a runtime crash with no hint from the env file.

**Problem B:** `apps/worker/src/lib/minio-client.ts` hardcodes `BUCKET = 'jarvis-files'` ignoring `MINIO_BUCKET` from `.env.example`.

**Files:**
- Modify: `.env.example`
- Modify: `apps/worker/src/lib/minio-client.ts`

- [ ] **Step 1: Add OPENAI_API_KEY to .env.example**

Add after `ANTHROPIC_API_KEY` line (line 26):

```
# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Read MINIO_BUCKET from env in minio-client.ts**

```typescript
// BEFORE (line 11):
export const BUCKET = 'jarvis-files';

// AFTER:
export const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';
```

- [ ] **Step 3: Commit**

```bash
git add .env.example apps/worker/src/lib/minio-client.ts
git commit -m "fix: add OPENAI_API_KEY to .env.example, read MINIO_BUCKET from env"
```

---

## Task 6 — Push to main

- [ ] **Step 1: Verify no uncommitted changes remain**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Check commit log**

```bash
git log --oneline -6
```

Expected output (recent 4 fix commits on top):
```
xxxxxxx fix: add OPENAI_API_KEY to .env.example, read MINIO_BUCKET from env
xxxxxxx fix: align search sort enum — newest/freshness/relevance/hybrid now work correctly
xxxxxxx fix: require KNOWLEDGE_READ permission for Ask AI API
xxxxxxx fix: add FILES_WRITE permission — unblocks file upload endpoints
xxxxxxx fix: normalize role codes to uppercase — fixes empty permissions for all users
xxxxxxx feat: auth hardening + knowledge/search/ask-ai/...
```

- [ ] **Step 3: Push to main**

```bash
git push origin main
```

---

## Self-Review

| Requirement | Covered by |
|-------------|------------|
| Role case mismatch (root cause) | Task 1 Step 1 |
| Seed role codes inconsistent with ROLE_PERMISSIONS | Task 1 Step 2-3 |
| Seed pageType 'article' invalid | Task 1 Step 4 |
| files:write permission missing | Task 2 |
| Ask API no permission enforcement | Task 3 |
| Search sort enum mismatch | Task 4 |
| OPENAI_API_KEY missing from .env | Task 5 Step 1 |
| MINIO_BUCKET hardcoded | Task 5 Step 2 |
| ask.ts role check case mismatch | Fixed automatically by Task 1 Step 1 (session now stores uppercase) |
| Admin API role code mismatch | Fixed automatically by Task 1 Step 2 (DB now has uppercase) |
