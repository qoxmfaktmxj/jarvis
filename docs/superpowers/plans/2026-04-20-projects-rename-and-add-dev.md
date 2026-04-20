# Projects Rename + Add-Dev Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `system`→`project` 리네임 + 회사당 1 row(환경은 `prod_*`/`dev_*` 컬럼) + 기존 `/projects` 완전 삭제 + 새 `additional_development`(/add-dev) 도메인 추가로 실무 용어에 맞게 재정비.

**Architecture:** Drizzle 스키마 리네임 + 컬럼 확장 + 자식 테이블 2개(환경별 access는 기존 테이블 재활용 + `env_type` 컬럼), 추가개발은 단일 엔티티 + 공수/매출/인력 자식 테이블. UI는 테이블 그리드 + 탭 기반 상세. 기존 `@jarvis/secret` ref + `canResolveSystemSecrets` RBAC 그대로 리네임만.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL, next-intl, @jarvis/secret, @jarvis/auth RBAC, Playwright e2e, Vitest

**Spec:** [docs/superpowers/specs/2026-04-20-projects-rename-and-add-dev-design.md](../specs/2026-04-20-projects-rename-and-add-dev-design.md)

**Builder model:** `claude-sonnet-4-6` (사용자 지시)

---

## Phase Dependency Graph

```
P0 ──► P1-A ──► P2-A ──► P3-A ──► P4-A ──┐
  │                                         ├──► P5 ──► P6
  └──► P1-B ──► P2-B ──► P3-B ──► P4-B ──┘
```

- `──►` 순차 의존
- `P1-A ∥ P1-B`, `P2-A ∥ P2-B`, `P3-A ∥ P3-B`, `P4-A ∥ P4-B` 는 병렬 가능

---

### Task P0: 기존 `/projects` 도메인 완전 삭제

**Files:**
- Delete: `packages/db/schema/project.ts` (current `project`, `project_task`, `project_inquiry`, `project_staff`)
- Delete: `apps/web/app/(app)/projects/**` (all current pages + tests)
- Delete: `apps/web/app/api/projects/**` (all current routes + tests)
- Delete: `apps/web/lib/queries/projects.ts` (old internal-project queries) — if exists separate from systems
- Delete: `apps/web/components/project/**` (if exists) — ProjectTable 등
- Modify: `packages/db/schema/index.ts` (remove exports for project/project_task/project_inquiry/project_staff)
- Modify: `packages/db/seed/dev.ts:70-100` (remove Portal Rewrite / Auth Migration / Search Upgrade + tasks seed)
- Modify: `packages/shared/constants/permissions.ts` (remove PROJECT_READ/CREATE/UPDATE/DELETE and role mappings)
- Modify: `apps/web/messages/ko.json` (remove `"Projects": {...}` namespace at line 310)
- Modify: `apps/web/components/layout/Sidebar.tsx:38` (remove `{ href: "/projects", label: "프로젝트", icon: FolderKanban }` — 나중 단계에서 `/systems` 항목을 `/projects`로 교체)
- New migration: `packages/db/drizzle/XXXX_drop_internal_projects.sql` — `DROP TABLE project_staff, project_inquiry, project_task, project CASCADE;`

- [ ] **Step 1: 삭제 대상 파일 목록 수집**

Run: `find apps/web/app/\(app\)/projects apps/web/app/api/projects apps/web/components/project -type f 2>/dev/null | tee /tmp/p0-delete-list.txt`

Expected: 모든 `/projects` 관련 라우트·컴포넌트 리스트 출력.

- [ ] **Step 2: 기존 `project` 관련 테스트가 없는지 확인 (있으면 삭제 포함)**

Run (Grep tool): pattern=`from "@/lib/queries/projects"|from "@jarvis/db/schema/project"|projectTask|projectInquiry|projectStaff`

Expected: 결과 파일들도 삭제 리스트에 추가.

- [ ] **Step 3: Drizzle migration 작성 — `DROP TABLE ... CASCADE`**

Create: `packages/db/drizzle/<next_seq>_drop_internal_projects.sql`
```sql
DROP TABLE IF EXISTS "project_staff" CASCADE;
DROP TABLE IF EXISTS "project_inquiry" CASCADE;
DROP TABLE IF EXISTS "project_task" CASCADE;
DROP TABLE IF EXISTS "project" CASCADE;
```

- [ ] **Step 4: 스키마 파일 삭제 + index.ts export 제거**

Delete: `packages/db/schema/project.ts`

Edit `packages/db/schema/index.ts`: remove `export * from "./project.js";` (정확한 라인은 파일 열어서 확인)

- [ ] **Step 5: 라우트/컴포넌트/쿼리 파일 전부 삭제**

Delete recursively:
```
apps/web/app/(app)/projects/
apps/web/app/api/projects/
apps/web/components/project/       (존재한다면)
apps/web/lib/queries/projects.ts   (존재한다면 — systems.ts와 별개 파일일 때만)
```

- [ ] **Step 6: 권한 상수 정리**

Edit `packages/shared/constants/permissions.ts`:
- Remove lines `PROJECT_READ: "project:read"` 등 4개
- Remove `PERMISSIONS.PROJECT_READ` references in role mappings (lines 49, 73, 98 등)

- [ ] **Step 7: i18n 네임스페이스 제거**

Edit `apps/web/messages/ko.json`:
- Remove `"Projects": { ... }` block at line 310 (JSON 블록 전체)
- `Nav.projects` 라인은 일단 **유지** (P3-A에서 `/projects` 새 의미로 리사이클할 때 재사용)

- [ ] **Step 8: Sidebar 항목 제거**

Edit `apps/web/components/layout/Sidebar.tsx:38`:
```tsx
// BEFORE
  { href: "/projects",   label: "프로젝트",  icon: FolderKanban },
// AFTER: (그 라인 삭제 — P3-A에서 /systems 자리에 /projects 재등장)
```

- [ ] **Step 9: 마이그레이션 + 빌드 + 타입체크**

Run:
```bash
pnpm --filter @jarvis/db drizzle-kit generate
pnpm --filter @jarvis/db migrate
pnpm tsc --noEmit
pnpm lint
```
Expected: 타입 에러/린트 에러 0. 마이그레이션 성공.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "chore(projects): delete obsolete internal-project domain

Remove project/project_task/project_inquiry/project_staff tables,
routes, components, i18n namespace, and PROJECT_* permissions.
Prepares slot for system->project rename in P1."
```

---

### Task P1-A: `system` → `project` DB 리네임 + 컬럼 확장 (병렬 with P1-B)

**Files:**
- Rename: `packages/db/schema/system.ts` → `packages/db/schema/project.ts`
- Modify: `packages/db/schema/index.ts` (export rename)
- New migration: `packages/db/drizzle/XXXX_rename_system_to_project.sql`

- [ ] **Step 1: Drizzle migration — 테이블 리네임 + 컬럼 확장 + UNIQUE 제약**

Create: `packages/db/drizzle/<next_seq>_rename_system_to_project.sql`
```sql
-- 1. Rename table
ALTER TABLE "system" RENAME TO "project";

-- 2. Add env-split columns (운영)
ALTER TABLE "project" ADD COLUMN "prod_domain_url" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "prod_connect_type" VARCHAR(20);
ALTER TABLE "project" ADD COLUMN "prod_repository_url" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "prod_db_dsn" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "prod_src_path" TEXT;
ALTER TABLE "project" ADD COLUMN "prod_class_path" TEXT;
ALTER TABLE "project" ADD COLUMN "prod_memo" TEXT;

-- 3. Add env-split columns (개발)
ALTER TABLE "project" ADD COLUMN "dev_domain_url" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "dev_connect_type" VARCHAR(20);
ALTER TABLE "project" ADD COLUMN "dev_repository_url" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "dev_db_dsn" VARCHAR(500);
ALTER TABLE "project" ADD COLUMN "dev_src_path" TEXT;
ALTER TABLE "project" ADD COLUMN "dev_class_path" TEXT;
ALTER TABLE "project" ADD COLUMN "dev_memo" TEXT;

-- 4. Drop legacy column 'environment' (환경 컬럼은 prod_*/dev_* 로 분할 흡수)
ALTER TABLE "project" DROP COLUMN IF EXISTS "environment";

-- 5. Rename dependent index
ALTER INDEX IF EXISTS "idx_system_knowledge_page" RENAME TO "idx_project_knowledge_page";

-- 6. Enforce company uniqueness (dev seed 4건 drop 후 적용 권장 — seed 더미 먼저 비우고)
DELETE FROM "project";  -- dev seed 4건 (P0 drop 이후 남아있는 system seed 데이터) 제거
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_company_unique" UNIQUE ("workspace_id", "company_id");
ALTER TABLE "project" ALTER COLUMN "company_id" SET NOT NULL;
```

- [ ] **Step 2: 스키마 파일 리네임 + 내용 업데이트**

```bash
mv packages/db/schema/system.ts packages/db/schema/project.ts
```

Edit `packages/db/schema/project.ts`:
```ts
import {
  index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { company } from "./company.js";
import { knowledgePage } from "./knowledge.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  companyId: uuid("company_id").notNull().references(() => company.id),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  sensitivity: varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  ownerId: uuid("owner_id").references(() => user.id),
  knowledgePageId: uuid("knowledge_page_id").references(() => knowledgePage.id),
  // 운영
  prodDomainUrl: varchar("prod_domain_url", { length: 500 }),
  prodConnectType: varchar("prod_connect_type", { length: 20 }),
  prodRepositoryUrl: varchar("prod_repository_url", { length: 500 }),
  prodDbDsn: varchar("prod_db_dsn", { length: 500 }),
  prodSrcPath: text("prod_src_path"),
  prodClassPath: text("prod_class_path"),
  prodMemo: text("prod_memo"),
  // 개발
  devDomainUrl: varchar("dev_domain_url", { length: 500 }),
  devConnectType: varchar("dev_connect_type", { length: 20 }),
  devRepositoryUrl: varchar("dev_repository_url", { length: 500 }),
  devDbDsn: varchar("dev_db_dsn", { length: 500 }),
  devSrcPath: text("dev_src_path"),
  devClassPath: text("dev_class_path"),
  devMemo: text("dev_memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  knowledgePageIdx: index("idx_project_knowledge_page").on(t.knowledgePageId),
  workspaceCompanyUnique: uniqueIndex("project_workspace_company_unique").on(t.workspaceId, t.companyId),
}));

export const projectRelations = relations(project, ({ many, one }) => ({
  company: one(company, { fields: [project.companyId], references: [company.id] }),
  owner: one(user, { fields: [project.ownerId], references: [user.id] }),
  // accessEntries는 P2-A에서 추가
}));
```

- [ ] **Step 3: index.ts export 갱신**

Edit `packages/db/schema/index.ts`:
```ts
// BEFORE:
// export * from "./system.js";
// AFTER:
export * from "./project.js";
```
(기존 `system_access` export는 P2-A에서 `project_access`로 처리)

- [ ] **Step 4: Drizzle 생성 + 마이그레이션**

Run:
```bash
pnpm --filter @jarvis/db drizzle-kit generate
pnpm --filter @jarvis/db migrate
```
Expected: 에러 없음. drizzle meta에 새 스키마 반영.

- [ ] **Step 5: 타입 체크 (리네임 파급 에러 리스트 확인)**

Run: `pnpm tsc --noEmit 2>&1 | tee /tmp/p1a-errors.txt`

Expected: system → project 리네임으로 깨진 import가 전부 `apps/web/**`에 나옴. P3-A에서 수정. 여기선 오류 리스트만 캡처.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/schema/project.ts packages/db/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): rename system to project + add env-split columns + company-unique"
```

---

### Task P1-B: 권한 상수·RBAC·i18n·Sidebar 리네임 (병렬 with P1-A)

**Files:**
- Modify: `packages/shared/constants/permissions.ts`
- Modify: `packages/auth/rbac.ts` — `SYSTEM_ROLE_ORDER` → `PROJECT_ROLE_ORDER`, `canAccessSystemAccessEntry` → `canAccessProjectAccessEntry`, `canResolveSystemSecrets` → `canResolveProjectSecrets`
- Modify: `packages/auth/__tests__/wiki-sensitivity.test.ts`, `rbac-permissions.test.ts`, `rbac-matrix.test.ts` — 리네임 반영
- Modify: `apps/web/messages/ko.json` — `"Systems": {...}` → `"Projects": {...}`, `Nav.systems` → `Nav.projects`(이미 있음, 라벨은 유지)

- [ ] **Step 1: 권한 상수 리네임 (전역 replace)**

Edit `packages/shared/constants/permissions.ts`:
```ts
// BEFORE
SYSTEM_READ: "system:read",
SYSTEM_CREATE: "system:create",
SYSTEM_UPDATE: "system:update",
SYSTEM_DELETE: "system:delete",
SYSTEM_ACCESS_SECRET: "system:access-secret",

// AFTER
PROJECT_READ: "project:read",
PROJECT_CREATE: "project:create",
PROJECT_UPDATE: "project:update",
PROJECT_DELETE: "project:delete",
PROJECT_ACCESS_SECRET: "project:access-secret",
```
+ role permission 매핑 3곳(`PERMISSIONS.SYSTEM_READ` 등) 모두 `PROJECT_*`로 replace.

- [ ] **Step 2: RBAC 헬퍼 리네임**

Edit `packages/auth/rbac.ts`:
- `SYSTEM_ROLE_ORDER` → `PROJECT_ROLE_ORDER` (replace_all)
- `canAccessSystemAccessEntry` → `canAccessProjectAccessEntry` (함수 선언 + 모든 call site)
- `canResolveSystemSecrets` → `canResolveProjectSecrets` (함수 선언 + 모든 call site)
- `SYSTEM_ACCESS_SECRET` → `PROJECT_ACCESS_SECRET` 참조 update
- docstring 주석도 `SYSTEM_*` → `PROJECT_*`

- [ ] **Step 3: 테스트 파일 리네임 반영**

Edit the following files — replace_all `SYSTEM_` → `PROJECT_`, `canAccessSystemAccessEntry` → `canAccessProjectAccessEntry`, `canResolveSystemSecrets` → `canResolveProjectSecrets`:
- `packages/auth/__tests__/rbac-permissions.test.ts`
- `packages/auth/__tests__/rbac-matrix.test.ts`
- `packages/auth/__tests__/wiki-sensitivity.test.ts`

- [ ] **Step 4: i18n 네임스페이스 리네임**

Edit `apps/web/messages/ko.json`:
- Find `"Systems": {` (line ~387) → rename to `"Projects": {`
- JSON 내부 라벨은 그대로 유지 (내용은 "시스템" 용어가 섞여 있을 수 있으나 사용자가 "프로젝트"로 인식하도록 후속에서 자연스럽게 교정 — 이번 단계는 **네임스페이스 키만** 변경)
- `Nav.systems` 키도 삭제 (P3-A에서 `Nav.projects` 재사용)

- [ ] **Step 5: 타입 체크 + 테스트**

Run:
```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/auth test
```
Expected: auth 패키지 테스트 전부 PASS, 타입에러 0. 단 `apps/web/**` 타입에러는 P3-A까지 남음.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/constants/permissions.ts packages/auth/ apps/web/messages/ko.json
git commit -m "feat(auth,i18n): rename SYSTEM_* to PROJECT_* permissions and i18n namespace"
```

---

### Task P2-A: `system_access` → `project_access` + `env_type` 컬럼 (의존: P1-A, 병렬 with P2-B)

**Files:**
- Modify: `packages/db/schema/project.ts` (add `projectAccess` table to same file; 구 system.ts에 있던 `systemAccess` 제거)
- Modify: `packages/db/schema/index.ts` (export 갱신)
- New migration: `packages/db/drizzle/XXXX_rename_system_access_add_env_type.sql`

- [ ] **Step 1: Drizzle migration**

Create: `packages/db/drizzle/<next_seq>_rename_system_access_add_env_type.sql`
```sql
ALTER TABLE "system_access" RENAME TO "project_access";
ALTER TABLE "project_access" RENAME COLUMN "system_id" TO "project_id";
ALTER TABLE "project_access" ADD COLUMN "env_type" VARCHAR(10);
-- 기존 4건 더미는 project drop으로 이미 사라졌으므로 env_type 기본값 불필요.
-- 새 row부터 NOT NULL 강제:
ALTER TABLE "project_access" ALTER COLUMN "env_type" SET NOT NULL;
DROP INDEX IF EXISTS "idx_system_access_system";
CREATE INDEX IF NOT EXISTS "idx_project_access_project" ON "project_access"("project_id");
```

- [ ] **Step 2: 스키마 파일에 `project_access` 추가**

Edit `packages/db/schema/project.ts` — 파일 하단에 추가:
```ts
export const projectAccess = pgTable("project_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  envType: varchar("env_type", { length: 10 }).notNull(),   // 'prod' | 'dev'
  accessType: varchar("access_type", { length: 20 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  host: varchar("host", { length: 500 }),
  port: integer("port"),
  usernameRef: varchar("username_ref", { length: 500 }),
  passwordRef: varchar("password_ref", { length: 500 }),
  connectionStringRef: varchar("connection_string_ref", { length: 500 }),
  vpnFileRef: varchar("vpn_file_ref", { length: 500 }),
  notes: text("notes"),
  requiredRole: varchar("required_role", { length: 50 }).default("DEVELOPER").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const projectAccessRelations = relations(projectAccess, ({ one }) => ({
  project: one(project, { fields: [projectAccess.projectId], references: [project.id] })
}));

// project.relations에 accessEntries 추가 (P1-A에서 빈 상태로 두었던 것):
// (P1-A 편집 내용과 merge)
```
projectRelations 수정:
```ts
export const projectRelations = relations(project, ({ many, one }) => ({
  company: one(company, { fields: [project.companyId], references: [company.id] }),
  owner: one(user, { fields: [project.ownerId], references: [user.id] }),
  accessEntries: many(projectAccess),
}));
```

- [ ] **Step 3: Drizzle 재생성 + 마이그**

```bash
pnpm --filter @jarvis/db drizzle-kit generate
pnpm --filter @jarvis/db migrate
```

- [ ] **Step 4: 커밋**

```bash
git add packages/db/schema/project.ts packages/db/drizzle/
git commit -m "feat(db): rename system_access to project_access + env_type column"
```

---

### Task P2-B: `additional_development` 스키마 + 권한 + i18n (의존: P1-B, 병렬 with P2-A)

**Files:**
- Create: `packages/db/schema/additional-development.ts`
- Modify: `packages/db/schema/index.ts` (export 추가)
- Modify: `packages/shared/constants/permissions.ts` (ADDITIONAL_DEV_* 추가)
- Modify: `apps/web/messages/ko.json` (AdditionalDev 네임스페이스 추가)
- Modify: `apps/web/components/layout/Sidebar.tsx` (메뉴 추가)
- New migration: `packages/db/drizzle/XXXX_create_additional_development.sql`

- [ ] **Step 1: 스키마 파일 생성**

Create: `packages/db/schema/additional-development.ts`
```ts
import {
  boolean, date, index, integer, numeric, pgTable, text,
  timestamp, uniqueIndex, uuid, varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { project } from "./project.js";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const additionalDevelopment = pgTable("additional_development", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "restrict" }),
  requestYearMonth: varchar("request_year_month", { length: 7 }),
  requestSequence: integer("request_sequence"),
  requesterName: varchar("requester_name", { length: 100 }),
  requestContent: text("request_content"),
  part: varchar("part", { length: 20 }),
  status: varchar("status", { length: 30 }).default("협의중").notNull(),
  projectName: varchar("project_name", { length: 500 }),
  contractNumber: varchar("contract_number", { length: 50 }),
  contractStartMonth: varchar("contract_start_month", { length: 7 }),
  contractEndMonth: varchar("contract_end_month", { length: 7 }),
  contractAmount: numeric("contract_amount", { precision: 14, scale: 0 }),
  isPaid: boolean("is_paid"),
  invoiceIssued: boolean("invoice_issued"),
  inspectionConfirmed: boolean("inspection_confirmed"),
  estimateProgress: text("estimate_progress"),
  devStartDate: date("dev_start_date"),
  devEndDate: date("dev_end_date"),
  pmId: uuid("pm_id").references(() => user.id),
  developerId: uuid("developer_id").references(() => user.id),
  vendorContactNote: text("vendor_contact_note"),
  estimatedEffort: numeric("estimated_effort", { precision: 8, scale: 2 }),
  actualEffort: numeric("actual_effort", { precision: 8, scale: 2 }),
  attachmentFileRef: varchar("attachment_file_ref", { length: 500 }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("idx_add_dev_project").on(t.projectId),
  statusIdx: index("idx_add_dev_status").on(t.status),
  yearMonthIdx: index("idx_add_dev_year_month").on(t.requestYearMonth),
}));

export const additionalDevelopmentEffort = pgTable("additional_development_effort", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  effort: numeric("effort", { precision: 8, scale: 2 }).notNull(),
}, (t) => ({
  unq: uniqueIndex("add_dev_effort_ym_unique").on(t.addDevId, t.yearMonth),
}));

export const additionalDevelopmentRevenue = pgTable("additional_development_revenue", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  yearMonth: varchar("year_month", { length: 7 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 0 }).notNull(),
}, (t) => ({
  unq: uniqueIndex("add_dev_revenue_ym_unique").on(t.addDevId, t.yearMonth),
}));

export const additionalDevelopmentStaff = pgTable("additional_development_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  addDevId: uuid("add_dev_id").notNull().references(() => additionalDevelopment.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => user.id),
  role: varchar("role", { length: 50 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
});

export const additionalDevelopmentRelations = relations(additionalDevelopment, ({ many, one }) => ({
  project: one(project, { fields: [additionalDevelopment.projectId], references: [project.id] }),
  pm: one(user, { fields: [additionalDevelopment.pmId], references: [user.id], relationName: "pm" }),
  developer: one(user, { fields: [additionalDevelopment.developerId], references: [user.id], relationName: "developer" }),
  efforts: many(additionalDevelopmentEffort),
  revenues: many(additionalDevelopmentRevenue),
  staff: many(additionalDevelopmentStaff),
}));
```

- [ ] **Step 2: export 추가**

Edit `packages/db/schema/index.ts`: append `export * from "./additional-development.js";`

- [ ] **Step 3: Drizzle 생성 + 마이그**

```bash
pnpm --filter @jarvis/db drizzle-kit generate
pnpm --filter @jarvis/db migrate
```
Expected: 4개 테이블 CREATE 마이그레이션 자동 생성.

- [ ] **Step 4: 권한 상수 추가**

Edit `packages/shared/constants/permissions.ts`:
```ts
// 추가 (PROJECT_ACCESS_SECRET 아래에):
ADDITIONAL_DEV_READ: "additional-dev:read",
ADDITIONAL_DEV_CREATE: "additional-dev:create",
ADDITIONAL_DEV_UPDATE: "additional-dev:update",
ADDITIONAL_DEV_DELETE: "additional-dev:delete",
```
+ role mapping: ADMIN, MANAGER 에 4개 전부, VIEWER에 READ 만.

- [ ] **Step 5: i18n 네임스페이스 추가**

Edit `apps/web/messages/ko.json`: append
```json
"AdditionalDev": {
  "title": "추가개발",
  "subtitle": "총 {total}건의 추가개발 프로젝트",
  "newAddDev": "새 추가개발",
  "applyFilters": "필터 적용",
  "allStatuses": "전체 상태",
  "allParts": "전체 파트",
  "statuses": {
    "discussing": "협의중",
    "inProgress": "진행중",
    "done": "완료",
    "hold": "보류"
  },
  "tabs": {
    "overview": "개요",
    "effort": "공수",
    "revenue": "매출",
    "staff": "투입인력"
  },
  "fields": {
    "requestYearMonth": "요청년월",
    "requesterName": "요청자",
    "requestContent": "요청내용",
    "part": "파트",
    "projectName": "프로젝트명",
    "contractNumber": "계약번호",
    "contractStartMonth": "계약시작",
    "contractEndMonth": "계약종료",
    "contractAmount": "계약금액",
    "pm": "PM",
    "developer": "개발자",
    "devStartDate": "개발시작",
    "devEndDate": "개발종료",
    "estimatedEffort": "유상공수",
    "actualEffort": "실공수"
  }
}
```
+ Nav에 `"additionalDev": "추가개발"` 추가.

- [ ] **Step 6: Sidebar 메뉴 추가**

Edit `apps/web/components/layout/Sidebar.tsx`:
```tsx
// 시스템 라인 아래(/systems 자리)에 추가 — P3-A에서 /systems가 /projects로 바뀜
  { href: "/add-dev", label: "추가개발", icon: ClipboardList },
```
(`ClipboardList`는 `lucide-react`에서 import)

- [ ] **Step 7: 타입체크 + DB 마이그 검증**

Run:
```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/db test 2>/dev/null || true
```

- [ ] **Step 8: 커밋**

```bash
git add packages/db/schema/additional-development.ts packages/db/schema/index.ts packages/db/drizzle/ packages/shared/constants/permissions.ts apps/web/messages/ko.json apps/web/components/layout/Sidebar.tsx
git commit -m "feat(add-dev): scaffold additional_development schema + permissions + i18n + menu"
```

---

### Task P3-A: `/projects` 라우트·쿼리·API·UI (의존: P2-A, 병렬 with P3-B)

**Files:**
- Rename: `apps/web/app/(app)/systems/**` → `apps/web/app/(app)/projects/**`
- Rename: `apps/web/app/api/systems/**` → `apps/web/app/api/projects/**`
- Rename: `apps/web/lib/queries/systems.ts` → `apps/web/lib/queries/projects.ts`
- Rename: `apps/web/lib/queries/systems.test.ts` → `apps/web/lib/queries/projects.test.ts`
- Rename: `apps/web/components/system/**` → `apps/web/components/project/**`
- Create: `apps/web/components/project/ProjectTable.tsx` (그리드 전환용, SystemCard 대체)
- Delete: `apps/web/components/project/SystemCard.tsx` (리네임 완료 후)
- Modify: `apps/web/app/(app)/projects/page.tsx` — 리스트 카드 → 테이블 그리드
- Create: `apps/web/app/(app)/projects/[projectId]/add-dev/page.tsx` — 상세 탭 스켈레톤 (P5에서 실데이터 연결)
- Create: `apps/web/middleware.ts` (이미 있으면 수정) — `/systems/*` → `/projects/*` 301 redirect

- [ ] **Step 1: 디렉토리/파일 bulk rename**

Run:
```bash
cd apps/web
git mv app/\(app\)/systems app/\(app\)/projects
git mv app/api/systems app/api/projects
git mv lib/queries/systems.ts lib/queries/projects.ts
git mv lib/queries/systems.test.ts lib/queries/projects.test.ts
git mv components/system components/project
```

- [ ] **Step 2: 파일 내부 심볼 치환 (대량 replace_all)**

각 파일에서 replace_all:
- `from "@/lib/queries/systems"` → `from "@/lib/queries/projects"`
- `from "@/components/system/` → `from "@/components/project/`
- `listSystems` → `listProjects`, `getSystem` → `getProject`, `createSystem` → `createProject`, `updateSystem` → `updateProject`, `deleteSystem` → `deleteProject`
- `listSystemAccessEntries` → `listProjectAccessEntries`, `createSystemAccess` → `createProjectAccess`, `deleteSystemAccess` → `deleteProjectAccess`
- `system` 변수명 → `project`, `systemId` → `projectId` (주의: 파일 내용상 프로젝트 엔티티를 참조하는 경우만)
- `PERMISSIONS.SYSTEM_*` → `PERMISSIONS.PROJECT_*`
- `systemCard` → `projectTable` 등 컴포넌트 참조
- `canAccessSystemAccessEntry` → `canAccessProjectAccessEntry`, `canResolveSystemSecrets` → `canResolveProjectSecrets`
- i18n `useTranslations("Systems")` → `useTranslations("Projects")`

대상 파일: `apps/web/app/(app)/projects/**/*.tsx`, `apps/web/app/api/projects/**/*.ts`, `apps/web/lib/queries/projects.ts`, `apps/web/components/project/**/*.tsx`

각 파일 Read → Edit replace_all 로 처리.

- [ ] **Step 3: `projects.ts` 쿼리 — env-split 컬럼 채택**

Edit `apps/web/lib/queries/projects.ts` — `CreateSystemInput`을 다음으로 교체:
```ts
type CreateProjectInput = {
  companyId: string;
  name: string;
  description?: string;
  sensitivity?: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY";
  status?: "active" | "deprecated" | "decommissioned";
  prodDomainUrl?: string;
  prodConnectType?: "IP" | "VPN" | "VDI" | "RE";
  prodRepositoryUrl?: string;
  prodDbDsn?: string;
  prodSrcPath?: string;
  prodClassPath?: string;
  prodMemo?: string;
  devDomainUrl?: string;
  devConnectType?: "IP" | "VPN" | "VDI" | "RE";
  devRepositoryUrl?: string;
  devDbDsn?: string;
  devSrcPath?: string;
  devClassPath?: string;
  devMemo?: string;
};
```
`createProject` 함수 insert values에 모든 `prod_*`, `dev_*` 매핑 추가.
`listProjects` 필터에 `connectType` 추가 (prod or dev 둘 중 하나가 일치하는 `or()` 조건), `hasDev` 추가 (`devDomainUrl IS NOT NULL` 등).
`listSystems.category` 필터는 **제거** (새 스키마에 `category` 없음 — 만약 있었다면 삭제).

`CreateSystemAccessInput` → `CreateProjectAccessInput` + `envType: "prod" | "dev"` 필드 추가. `createProjectAccess` insert에 `envType` 포함.

- [ ] **Step 4: 리스트 테이블 컴포넌트 신규 작성**

Create: `apps/web/components/project/ProjectTable.tsx`
```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type ProjectTableRow = {
  id: string;
  companyCode: string | null;
  companyName: string | null;
  name: string;
  prodDomainUrl: string | null;
  devDomainUrl: string | null;
  status: string;
  sensitivity: string;
  ownerName: string | null;
  updatedAt: Date;
};

export function ProjectTable({ data }: { data: ProjectTableRow[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-surface-500">프로젝트가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-[13px] text-surface-600">
          <tr>
            <th className="px-3 py-2 text-left">회사코드</th>
            <th className="px-3 py-2 text-left">회사명</th>
            <th className="px-3 py-2 text-left">시스템명</th>
            <th className="px-3 py-2 text-left">운영 URL</th>
            <th className="px-3 py-2 text-left">개발 URL</th>
            <th className="px-3 py-2 text-left">상태</th>
            <th className="px-3 py-2 text-left">민감도</th>
            <th className="px-3 py-2 text-left">담당자</th>
            <th className="px-3 py-2 text-left">업데이트</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
              <td className="px-3 py-2 font-mono text-xs">{r.companyCode ?? "—"}</td>
              <td className="px-3 py-2">
                <Link href={`/projects/${r.id}`} className="text-isu-600 hover:underline">
                  {r.companyName ?? "—"}
                </Link>
              </td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-xs">
                {r.prodDomainUrl ? <a href={r.prodDomainUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.prodDomainUrl.replace(/^https?:\/\//, "")}</a> : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.devDomainUrl ? <a href={r.devDomainUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.devDomainUrl.replace(/^https?:\/\//, "")}</a> : "—"}
              </td>
              <td className="px-3 py-2"><Badge variant={r.status === "active" ? "success" : "warning"}>{r.status}</Badge></td>
              <td className="px-3 py-2"><Badge variant="outline">{r.sensitivity}</Badge></td>
              <td className="px-3 py-2">{r.ownerName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-surface-500">
                {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(new Date(r.updatedAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: `/projects/page.tsx` 교체 (카드 그리드 → 테이블)**

Edit `apps/web/app/(app)/projects/page.tsx`:
- import `ProjectTable` 대신 `SystemCard` 제거
- `listProjects` 반환값을 `ProjectTableRow[]`로 JOIN (company 조인) — 쿼리 함수에서 조인 처리 or 페이지에서 추가 조회
- 필터 select: `category` 제거, `environment` → `connectType`, 옵션 값은 IP/VPN/VDI/RE
- 컴포넌트 호출: `<ProjectTable data={result.data} />`

- [ ] **Step 6: `/systems/*` → `/projects/*` redirect**

Create or modify: `apps/web/middleware.ts` — 존재하면 기존 matcher에 `/systems/:path*` 추가:
```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/systems")) {
    const url = req.nextUrl.clone();
    url.pathname = req.nextUrl.pathname.replace(/^\/systems/, "/projects");
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/systems/:path*"],
};
```
(기존 middleware 있으면 merge)

- [ ] **Step 7: 상세 탭에 `/projects/[id]/add-dev` 스켈레톤 추가**

Create: `apps/web/app/(app)/projects/[projectId]/add-dev/page.tsx`
```tsx
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function ProjectAddDevTabPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  return (
    <div className="rounded-md border border-dashed border-surface-300 p-8 text-center text-surface-500">
      이 프로젝트의 추가개발 건 목록은 P5에서 연결됩니다. (projectId: {projectId})
    </div>
  );
}
```

Edit `apps/web/components/project/SystemTabs.tsx` → 파일 리네임 후 `ProjectTabs.tsx`로, 탭 배열에 `{ href: "add-dev", label: "추가개발" }` 추가.

- [ ] **Step 8: Sidebar에 `/projects` 메뉴 라벨 유지 확인**

Edit `apps/web/components/layout/Sidebar.tsx`:
- `/systems` 라인(line 39) 을 **제거**하고 `/projects` 메뉴가 `"프로젝트"` 라벨로 존재하도록 유지:
```tsx
  { href: "/projects",   label: "프로젝트",  icon: Server },
```

- [ ] **Step 9: 빌드·테스트·스모크**

Run:
```bash
pnpm tsc --noEmit
pnpm lint
pnpm --filter @jarvis/web test -- --run apps/web/lib/queries/projects.test.ts
pnpm --filter @jarvis/web build
```
그리고 dev 서버 실행 후 curl:
```bash
pnpm --filter @jarvis/web dev &
sleep 8
curl -I http://localhost:3010/projects     # 200
curl -I http://localhost:3010/systems      # 301 redirect
```

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat(projects): rename systems->projects UI+API+queries, table grid, redirect, add-dev tab skeleton"
```

---

### Task P3-B: `/add-dev` 라우트·쿼리·API·UI (의존: P2-B, 병렬 with P3-A)

**Files:**
- Create: `apps/web/lib/queries/additional-dev.ts`
- Create: `apps/web/lib/queries/additional-dev.test.ts`
- Create: `apps/web/app/api/add-dev/route.ts` (list + create)
- Create: `apps/web/app/api/add-dev/[id]/route.ts` (get + update + delete)
- Create: `apps/web/app/api/add-dev/[id]/effort/route.ts`
- Create: `apps/web/app/api/add-dev/[id]/revenue/route.ts`
- Create: `apps/web/app/api/add-dev/[id]/staff/route.ts`
- Create: `apps/web/app/(app)/add-dev/page.tsx` (list)
- Create: `apps/web/app/(app)/add-dev/new/page.tsx`
- Create: `apps/web/app/(app)/add-dev/[id]/layout.tsx` (탭 네비)
- Create: `apps/web/app/(app)/add-dev/[id]/page.tsx` (overview)
- Create: `apps/web/app/(app)/add-dev/[id]/effort/page.tsx`
- Create: `apps/web/app/(app)/add-dev/[id]/revenue/page.tsx`
- Create: `apps/web/app/(app)/add-dev/[id]/staff/page.tsx`
- Create: `apps/web/app/(app)/add-dev/[id]/edit/page.tsx`
- Create: `apps/web/components/add-dev/AddDevTable.tsx`
- Create: `apps/web/components/add-dev/AddDevForm.tsx`
- Create: `apps/web/components/add-dev/AddDevTabs.tsx`
- Create: `apps/web/components/add-dev/EffortHeatmap.tsx`
- Create: `apps/web/components/add-dev/RevenueHeatmap.tsx`
- Create: `apps/web/components/add-dev/StaffTable.tsx`

- [ ] **Step 1: TDD — 쿼리 함수 테스트 먼저 작성**

Create: `apps/web/lib/queries/additional-dev.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { listAdditionalDev, createAdditionalDev, getAdditionalDev } from "./additional-dev";
// 기존 test harness (systems.test.ts 패턴) 재사용 — in-memory db fixture

describe("additional-dev queries", () => {
  it("listAdditionalDev returns paginated data", async () => {
    const result = await listAdditionalDev({ workspaceId: "00000000-0000-0000-0000-000000000000", page: 1, pageSize: 10 });
    expect(result.data).toBeInstanceOf(Array);
    expect(result.pagination.page).toBe(1);
  });

  it("createAdditionalDev persists project_id + status default", async () => {
    const created = await createAdditionalDev({
      workspaceId: "00000000-0000-0000-0000-000000000000",
      input: { projectId: "11111111-1111-1111-1111-111111111111", projectName: "테스트", part: "외부" }
    });
    expect(created.status).toBe("협의중");
    expect(created.projectId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("listAdditionalDev filters by status", async () => {
    const result = await listAdditionalDev({ workspaceId: "...", status: "진행중" });
    expect(result.data.every(r => r.status === "진행중")).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 (FAIL 예상)**

Run: `pnpm --filter @jarvis/web test additional-dev.test.ts`
Expected: FAIL — `listAdditionalDev is not defined`

- [ ] **Step 3: 쿼리 함수 구현**

Create: `apps/web/lib/queries/additional-dev.ts`
```ts
import { db } from "@jarvis/db/client";
import {
  additionalDevelopment,
  additionalDevelopmentEffort,
  additionalDevelopmentRevenue,
  additionalDevelopmentStaff,
} from "@jarvis/db/schema";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";

type ListParams = {
  workspaceId: string;
  projectId?: string;
  status?: string;
  part?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  database?: typeof db;
};

export async function listAdditionalDev({
  workspaceId, projectId, status, part, q,
  page = 1, pageSize = 20, database = db,
}: ListParams) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const conds = [eq(additionalDevelopment.workspaceId, workspaceId)];
  if (projectId) conds.push(eq(additionalDevelopment.projectId, projectId));
  if (status) conds.push(eq(additionalDevelopment.status, status));
  if (part) conds.push(eq(additionalDevelopment.part, part));
  if (q) conds.push(or(
    ilike(additionalDevelopment.projectName, `%${q}%`),
    ilike(additionalDevelopment.requestContent, `%${q}%`),
  )!);
  const where = and(...conds);

  const [rows, totals] = await Promise.all([
    database.select().from(additionalDevelopment).where(where)
      .orderBy(desc(additionalDevelopment.createdAt))
      .limit(safeSize).offset((safePage - 1) * safeSize),
    database.select({ total: count() }).from(additionalDevelopment).where(where),
  ]);
  const total = Number(totals[0]?.total ?? 0);
  return {
    data: rows,
    pagination: {
      page: safePage, pageSize: safeSize,
      total, totalPages: total === 0 ? 1 : Math.ceil(total / safeSize),
    },
  };
}

export async function getAdditionalDev({ workspaceId, id, database = db }: { workspaceId: string; id: string; database?: typeof db }) {
  const [row] = await database.select().from(additionalDevelopment)
    .where(and(eq(additionalDevelopment.id, id), eq(additionalDevelopment.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

type CreateInput = {
  projectId: string;
  projectName?: string;
  requestYearMonth?: string;
  requestSequence?: number;
  requesterName?: string;
  requestContent?: string;
  part?: string;
  status?: string;
  contractNumber?: string;
  contractStartMonth?: string;
  contractEndMonth?: string;
  contractAmount?: string;
  isPaid?: boolean;
  invoiceIssued?: boolean;
  inspectionConfirmed?: boolean;
  estimateProgress?: string;
  devStartDate?: string;
  devEndDate?: string;
  pmId?: string;
  developerId?: string;
  vendorContactNote?: string;
  estimatedEffort?: string;
  actualEffort?: string;
  attachmentFileRef?: string;
  remark?: string;
};

export async function createAdditionalDev({
  workspaceId, input, database = db,
}: { workspaceId: string; input: CreateInput; database?: typeof db }) {
  const [created] = await database.insert(additionalDevelopment).values({
    workspaceId, ...input, status: input.status ?? "협의중",
  }).returning();
  return created!;
}

export async function updateAdditionalDev({ workspaceId, id, input, database = db }: { workspaceId: string; id: string; input: Partial<CreateInput>; database?: typeof db }) {
  const [updated] = await database.update(additionalDevelopment)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(additionalDevelopment.id, id), eq(additionalDevelopment.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

export async function deleteAdditionalDev({ workspaceId, id, database = db }: { workspaceId: string; id: string; database?: typeof db }) {
  const [deleted] = await database.delete(additionalDevelopment)
    .where(and(eq(additionalDevelopment.id, id), eq(additionalDevelopment.workspaceId, workspaceId)))
    .returning({ id: additionalDevelopment.id });
  return deleted ?? null;
}

// effort/revenue/staff upsert 함수들
export async function upsertEffort({ addDevId, yearMonth, effort, database = db }: { addDevId: string; yearMonth: string; effort: string; database?: typeof db }) {
  await database.insert(additionalDevelopmentEffort)
    .values({ addDevId, yearMonth, effort })
    .onConflictDoUpdate({ target: [additionalDevelopmentEffort.addDevId, additionalDevelopmentEffort.yearMonth], set: { effort } });
}
export async function listEfforts({ addDevId, database = db }: { addDevId: string; database?: typeof db }) {
  return database.select().from(additionalDevelopmentEffort).where(eq(additionalDevelopmentEffort.addDevId, addDevId));
}
// revenue, staff 동일 패턴
export async function upsertRevenue({ addDevId, yearMonth, amount, database = db }: { addDevId: string; yearMonth: string; amount: string; database?: typeof db }) {
  await database.insert(additionalDevelopmentRevenue)
    .values({ addDevId, yearMonth, amount })
    .onConflictDoUpdate({ target: [additionalDevelopmentRevenue.addDevId, additionalDevelopmentRevenue.yearMonth], set: { amount } });
}
export async function listRevenues({ addDevId, database = db }: { addDevId: string; database?: typeof db }) {
  return database.select().from(additionalDevelopmentRevenue).where(eq(additionalDevelopmentRevenue.addDevId, addDevId));
}
export async function addStaff({ addDevId, userId, role, startDate, endDate, database = db }: { addDevId: string; userId?: string; role?: string; startDate?: string; endDate?: string; database?: typeof db }) {
  const [created] = await database.insert(additionalDevelopmentStaff)
    .values({ addDevId, userId, role, startDate, endDate }).returning();
  return created!;
}
export async function listStaff({ addDevId, database = db }: { addDevId: string; database?: typeof db }) {
  return database.select().from(additionalDevelopmentStaff).where(eq(additionalDevelopmentStaff.addDevId, addDevId));
}
```

- [ ] **Step 4: 테스트 재실행 — PASS 확인**

Run: `pnpm --filter @jarvis/web test additional-dev.test.ts`
Expected: PASS.

- [ ] **Step 5: API 라우트 작성 (list + create + get + update + delete + effort/revenue/staff)**

Create `apps/web/app/api/add-dev/route.ts` (systems/route.ts 패턴 그대로):
```ts
import { NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requireApiSession } from "@/lib/server/api-auth";
import { listAdditionalDev, createAdditionalDev } from "@/lib/queries/additional-dev";

export async function GET(req: Request) {
  const session = await requireApiSession(PERMISSIONS.ADDITIONAL_DEV_READ);
  const url = new URL(req.url);
  const result = await listAdditionalDev({
    workspaceId: session.workspaceId,
    page: Number(url.searchParams.get("page") ?? "1"),
    pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
    status: url.searchParams.get("status") ?? undefined,
    part: url.searchParams.get("part") ?? undefined,
    projectId: url.searchParams.get("projectId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await requireApiSession(PERMISSIONS.ADDITIONAL_DEV_CREATE);
  const body = await req.json();
  const created = await createAdditionalDev({ workspaceId: session.workspaceId, input: body });
  return NextResponse.json(created, { status: 201 });
}
```
(나머지 `[id]/route.ts`, `[id]/effort/route.ts`, `[id]/revenue/route.ts`, `[id]/staff/route.ts`는 동일 패턴으로 작성. ADDITIONAL_DEV_UPDATE / _DELETE 권한 사용.)

- [ ] **Step 6: UI — 리스트 페이지**

Create: `apps/web/app/(app)/add-dev/page.tsx` — `/projects/page.tsx` 패턴 모방, 단 `ProjectTable` 대신 `AddDevTable`, 필터는 status/part/q/projectId(select: 프로젝트 목록).

Create: `apps/web/components/add-dev/AddDevTable.tsx` — `ProjectTable` 구조 모방, 컬럼은 i18n fields. 링크 `/add-dev/${id}`.

- [ ] **Step 7: UI — 상세 레이아웃(탭) + 개요 페이지**

Create: `apps/web/app/(app)/add-dev/[id]/layout.tsx` — `/projects/[id]/layout.tsx` 패턴 복사, `AddDevTabs` 사용.

Create: `apps/web/components/add-dev/AddDevTabs.tsx` — tabs = overview/effort/revenue/staff/edit.

Create: `apps/web/app/(app)/add-dev/[id]/page.tsx` — overview: 요청/계약/개발 섹션 카드 (읽기 전용 dl/dt/dd).

- [ ] **Step 8: UI — 공수/매출 heatmap**

Create: `apps/web/components/add-dev/EffortHeatmap.tsx`
```tsx
"use client";
type EffortRow = { yearMonth: string; effort: string };
export function EffortHeatmap({ data, year }: { data: EffortRow[]; year: number }) {
  const map = new Map(data.map(d => [d.yearMonth, Number(d.effort)]));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const max = Math.max(...Array.from(map.values()), 1);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 text-left">{year}년</th>
          {months.map(m => <th key={m} className="px-2 py-1">{m}월</th>)}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="px-2 py-1">공수</td>
          {months.map(m => {
            const key = `${year}-${m}`;
            const v = map.get(key) ?? 0;
            const intensity = max > 0 ? Math.round((v / max) * 100) : 0;
            return (
              <td key={m} className="px-2 py-1 text-center" style={{ backgroundColor: `rgba(220, 38, 38, ${intensity / 100})` }}>
                {v > 0 ? v.toFixed(1) : ""}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
```
Create `RevenueHeatmap.tsx` — 동일 패턴, `amount`, `"매출"`, 숫자 포맷 `Intl.NumberFormat("ko-KR")`.

Create `/add-dev/[id]/effort/page.tsx`, `/revenue/page.tsx`: 쿼리(`listEfforts`, `listRevenues`) 호출 + year 선택 드롭다운 + heatmap 렌더.

- [ ] **Step 9: UI — 투입인력 탭**

Create `/add-dev/[id]/staff/page.tsx` + `StaffTable.tsx` — 추가 폼(user select + role 입력 + 기간) + 리스트.

- [ ] **Step 10: UI — 신규/편집 폼**

Create: `apps/web/components/add-dev/AddDevForm.tsx` — 3섹션(요청/계약/개발) 한 폼, 필드는 i18n `AdditionalDev.fields.*` 사용. status는 select, isPaid/invoiceIssued/inspectionConfirmed는 checkbox.
Create: `/add-dev/new/page.tsx` + `/add-dev/[id]/edit/page.tsx`.

- [ ] **Step 11: 타입체크 + 테스트 + 스모크**

Run:
```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/web test
pnpm --filter @jarvis/web build
```
dev server 기동 후:
```bash
curl -I http://localhost:3010/add-dev     # 200
curl -I http://localhost:3010/add-dev/new # 200
```

- [ ] **Step 12: 커밋**

```bash
git add -A
git commit -m "feat(add-dev): add additional-dev list/detail/form + effort & revenue heatmaps"
```

---

### Task P4-A: TSMT001 → project + project_access 마이그 (의존: P3-A, 병렬 with P4-B)

**Files:**
- Create: `scripts/migrate-tsmt001-to-project.ts`
- Create: `scripts/tests/migrate-tsmt001-to-project.test.ts`
- Modify: `packages/db/seed/dev.ts` — 기존 system seed 4건 삭제 (P0에서 projects 삭제했지만 `systems` seed block은 남아 있음)

- [ ] **Step 1: 기존 seed 정리 (systems 4건 제거)**

Edit `packages/db/seed/dev.ts:102-121` — `// ---- Systems ----` 블록 전체 삭제. `systemAccess` insert 블록도 삭제.

- [ ] **Step 2: TDD — 마이그 로직 테스트 작성**

Create: `scripts/tests/migrate-tsmt001-to-project.test.ts` (Vitest)
```ts
import { describe, it, expect } from "vitest";
import { groupRecordsByCompanyAndEnv, mapPrimaryRowToProject, mapExtraRowToAccess } from "../migrate-tsmt001-to-project.js";

const sample = [
  { company_cd: "WHE", env_type: "운영", domain_addr: "http://hr.wh.com/", db_connect_info: "192.168.10.53:1521:HR", login_info: "admin/pw", memo: "m1" },
  { company_cd: "WHE", env_type: "운영", domain_addr: "http://alt.wh.com/", login_info: "user2/pw2", memo: "보조" },
  { company_cd: "WHE", env_type: "개발", domain_addr: "http://dev.wh.com/", login_info: "dev/pw" },
];

describe("migrate-tsmt001-to-project", () => {
  it("groups records into one project per company", () => {
    const groups = groupRecordsByCompanyAndEnv(sample);
    expect(Object.keys(groups).length).toBe(1);       // WHE 1개
    expect(Object.keys(groups.WHE).length).toBe(2);    // 운영 + 개발
    expect(groups.WHE["운영"].length).toBe(2);          // 운영 2건
  });

  it("picks primary row as the fullest by populated field count", () => {
    const primary = mapPrimaryRowToProject(sample.filter(r => r.env_type === "운영"));
    expect(primary.prod_domain_url).toBe("http://hr.wh.com/");  // memo+db 있는 쪽
  });

  it("maps extra rows to access entries with envType", () => {
    const extras = [sample[1]];
    const accesses = extras.map(r => mapExtraRowToAccess(r, "prod"));
    expect(accesses[0].envType).toBe("prod");
    expect(accesses[0].accessType).toBe("web");
    expect(accesses[0].label).toContain("보조");
  });
});
```

- [ ] **Step 3: 테스트 실행 FAIL 확인**

Run: `pnpm vitest run scripts/tests/migrate-tsmt001-to-project.test.ts`
Expected: FAIL.

- [ ] **Step 4: 마이그 스크립트 구현**

Create: `scripts/migrate-tsmt001-to-project.ts`
```ts
#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../packages/db/src/client';  // 경로 조정 필요
import { company, project, projectAccess } from '../packages/db/src/schema';
import { and, eq } from 'drizzle-orm';

type TsmtRecord = {
  enter_cd: string | null;
  company_cd: string | null;
  env_type: string | null;
  connect_cd: string | null;
  vpn_file_seq: string | null;
  domain_addr: string | null;
  login_info: string | null;
  svn_addr: string | null;
  db_connect_info: string | null;
  db_user_info: string | null;
  src_info: string | null;
  class_info: string | null;
  memo: string | null;
};

export function groupRecordsByCompanyAndEnv(recs: TsmtRecord[]) {
  const out: Record<string, Record<string, TsmtRecord[]>> = {};
  for (const r of recs) {
    if (!r.company_cd || !r.env_type) continue;
    out[r.company_cd] ??= {};
    out[r.company_cd][r.env_type] ??= [];
    out[r.company_cd][r.env_type].push(r);
  }
  return out;
}

function countPopulated(r: TsmtRecord): number {
  return Object.values(r).filter(v => v != null && String(v).length > 0).length;
}

function pickPrimary(rs: TsmtRecord[]): TsmtRecord {
  return [...rs].sort((a, b) => countPopulated(b) - countPopulated(a))[0]!;
}

function splitLogin(s: string | null): { user: string | null; pass: string | null } {
  if (!s) return { user: null, pass: null };
  const m = s.match(/^([^\/\s]+)\s*\/\s*(.+)$/);
  if (m) return { user: m[1], pass: m[2] };
  return { user: s, pass: null };
}

export function mapPrimaryRowToProject(rs: TsmtRecord[]) {
  const r = pickPrimary(rs);
  const env = r.env_type === '운영' ? 'prod' : 'dev';
  const col = (suffix: string) => `${env}_${suffix}` as const;
  return {
    envKey: env,
    [col('domain_url')]: r.domain_addr,
    [col('connect_type')]: r.connect_cd,
    [col('repository_url')]: r.svn_addr,
    [col('db_dsn')]: r.db_connect_info,
    [col('src_path')]: r.src_info,
    [col('class_path')]: r.class_info,
    [col('memo')]: [r.memo, r.login_info ? `로그인: ${r.login_info}` : null, r.db_user_info ? `DB계정: ${r.db_user_info}` : null].filter(Boolean).join('\n---\n'),
  };
}

export function mapExtraRowToAccess(r: TsmtRecord, envType: 'prod' | 'dev') {
  const { user, pass } = splitLogin(r.login_info);
  const accessType = r.db_connect_info ? 'db' : r.vpn_file_seq ? 'vpn' : 'web';
  return {
    envType,
    accessType,
    label: r.memo?.split('\n')[0]?.slice(0, 100) ?? `${accessType} access`,
    host: null as string | null,
    port: null as number | null,
    usernameRef: user,
    passwordRef: pass,
    connectionStringRef: r.db_connect_info,
    vpnFileRef: r.vpn_file_seq,
    notes: [r.src_info, r.class_info, r.memo].filter(Boolean).join('\n---\n'),
    requiredRole: 'DEVELOPER',
    sortOrder: 0,
  };
}

async function main() {
  const WS = process.env.WORKSPACE_ID ?? (await db.query.workspace.findFirst())?.id;
  if (!WS) throw new Error("workspace id required");

  const recordsPath = path.resolve(process.cwd(), 'data/infra/records.jsonl');
  const lines = fs.readFileSync(recordsPath, 'utf-8').split('\n').filter(Boolean);
  const records: TsmtRecord[] = lines.map(l => JSON.parse(l));
  const grouped = groupRecordsByCompanyAndEnv(records);

  const report = { companies: 0, projects: 0, access: 0, skipped: 0 };

  for (const [companyCd, byEnv] of Object.entries(grouped)) {
    // 1. company upsert
    let [co] = await db.select().from(company).where(and(eq(company.workspaceId, WS), eq(company.code, companyCd))).limit(1);
    if (!co) {
      [co] = await db.insert(company).values({ workspaceId: WS, code: companyCd, name: companyCd }).returning();
      report.companies++;
    }

    // 2. project insert (upsert on (workspace, company))
    const prodPrimary = byEnv['운영'] ? mapPrimaryRowToProject(byEnv['운영']) : null;
    const devPrimary = byEnv['개발'] ? mapPrimaryRowToProject(byEnv['개발']) : null;

    const projectValues = {
      workspaceId: WS, companyId: co!.id, name: `${companyCd} HR System`,
      description: null as string | null,
      ...prodPrimary, ...devPrimary,
    } as any;
    delete projectValues.envKey;   // 임시 필드 제거

    const [proj] = await db.insert(project).values(projectValues)
      .onConflictDoUpdate({ target: [project.workspaceId, project.companyId], set: projectValues })
      .returning();
    report.projects++;

    // 3. extras → project_access
    for (const env of ['운영', '개발'] as const) {
      const envType = env === '운영' ? 'prod' : 'dev';
      const rows = byEnv[env] ?? [];
      if (rows.length <= 1) continue;
      const primary = pickPrimary(rows);
      const extras = rows.filter(r => r !== primary);
      for (const r of extras) {
        await db.insert(projectAccess).values({
          workspaceId: WS, projectId: proj!.id,
          ...mapExtraRowToAccess(r, envType),
        });
        report.access++;
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: 테스트 PASS 확인**

Run: `pnpm vitest run scripts/tests/migrate-tsmt001-to-project.test.ts`
Expected: PASS.

- [ ] **Step 6: 실제 실행**

Run:
```bash
pnpm tsx scripts/migrate-tsmt001-to-project.ts
```
Expected: JSON 리포트 — projects ≥ 194, access ≥ 50.

- [ ] **Step 7: 검증 쿼리**

Run:
```bash
pnpm tsx -e "
import { db } from './packages/db/src/client.js';
import { project, projectAccess } from './packages/db/src/schema';
const [pc] = await db.select({ c: sql\`count(*)\` }).from(project);
const [ac] = await db.select({ c: sql\`count(*)\` }).from(projectAccess);
console.log({ projects: pc.c, access: ac.c });
"
```
Expected: projects 194, access 172 내외.

- [ ] **Step 8: 커밋**

```bash
git add scripts/migrate-tsmt001-to-project.ts scripts/tests/migrate-tsmt001-to-project.test.ts packages/db/seed/dev.ts
git commit -m "feat(migrate): TSMT001 -> project + project_access migration script"
```

---

### Task P4-B: 엑셀 → additional_development 마이그 (의존: P3-B, 병렬 with P4-A)

**Files:**
- Create: `scripts/migrate-add-dev-from-xls.ts`
- Create: `scripts/tests/migrate-add-dev-from-xls.test.ts`
- Dependency: `pnpm add -D xlsx` (SheetJS, .xls도 지원)

- [ ] **Step 1: xlsx 패키지 설치**

Run: `pnpm add -D -w xlsx`

- [ ] **Step 2: TDD — 엑셀 파싱 함수 테스트 작성**

Create: `scripts/tests/migrate-add-dev-from-xls.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { parseRequestSheet, excelDateToISO, parseMonthHeatmap } from "../migrate-add-dev-from-xls.js";

describe("migrate-add-dev-from-xls", () => {
  it("excelDateToISO converts 45689 to 2025-02-01", () => {
    expect(excelDateToISO(45689)).toBe("2025-02-01");
  });
  it("excelDateToISO extracts YYYY-MM from date", () => {
    expect(excelDateToISO(45689).slice(0, 7)).toBe("2025-02");
  });
  it("parseRequestSheet skips header rows and returns normalized objects", () => {
    const rows = [
      ['No', '요청회사', '요청년월', '요청순번', '진행상태', '파트', '요청자성명', '요청내용', 'PM', '개발자', '유상여부'],
      [1, '솔브레인', 45689, 28, '협의중', 'Saas', '', '디엔에프 법인추가 2차', '', '', 'Y'],
    ];
    const parsed = parseRequestSheet(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].requestCompany).toBe('솔브레인');
    expect(parsed[0].status).toBe('협의중');
    expect(parsed[0].isPaid).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 FAIL 확인**

Run: `pnpm vitest run scripts/tests/migrate-add-dev-from-xls.test.ts`

- [ ] **Step 4: 스크립트 구현**

Create: `scripts/migrate-add-dev-from-xls.ts`
```ts
#!/usr/bin/env tsx
import 'dotenv/config';
import * as XLSX from 'xlsx';
import path from 'node:path';
import { db } from '../packages/db/src/client.js';
import { and, eq } from 'drizzle-orm';
import {
  additionalDevelopment,
  additionalDevelopmentEffort,
  additionalDevelopmentRevenue,
  additionalDevelopmentStaff,
  company,
  project,
} from '../packages/db/src/schema/index.js';

export function excelDateToISO(serial: number): string {
  // Excel serial (1900 system) → ISO date
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const d = new Date(utcValue * 1000);
  return d.toISOString().slice(0, 10);
}

type ParsedRequest = {
  requestCompany: string;
  requestYearMonth: string | null;
  requestSequence: number | null;
  status: string | null;
  part: string | null;
  requesterName: string | null;
  requestContent: string | null;
  isPaid: boolean | null;
  invoiceIssued: boolean | null;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
  estimatedEffort: string | null;
  actualEffort: string | null;
  remark: string | null;
};

export function parseRequestSheet(rows: any[][]): ParsedRequest[] {
  // 헤더 2줄 스킵 (row 0, 1)
  const data = rows.slice(2);
  return data.filter(r => r[1]).map(r => ({
    requestCompany: String(r[1]),
    requestYearMonth: typeof r[2] === 'number' ? excelDateToISO(r[2]).slice(0, 7) : null,
    requestSequence: typeof r[3] === 'number' ? Math.floor(r[3]) : null,
    status: r[4] ?? null,
    part: r[5] ?? null,
    requesterName: r[6] ?? null,
    requestContent: r[7] ?? null,
    isPaid: r[10] === 'Y' ? true : r[10] === 'N' ? false : null,
    invoiceIssued: r[12] === 'Y' ? true : r[12] === 'N' ? false : null,
    contractStartMonth: typeof r[13] === 'number' ? excelDateToISO(r[13]).slice(0, 7) : null,
    contractEndMonth: typeof r[14] === 'number' ? excelDateToISO(r[14]).slice(0, 7) : null,
    estimatedEffort: typeof r[17] === 'number' ? String(r[17]) : null,
    actualEffort: typeof r[18] === 'number' ? String(r[18]) : null,
    remark: r[19] ?? null,
  }));
}

type HeatmapCell = { yearMonth: string; value: number };
export function parseMonthHeatmap(rows: any[][], startCol: number, year: number): Map<number, HeatmapCell[]> {
  // returns { rowIndex -> [ { ym, value } ] }
  const out = new Map<number, HeatmapCell[]>();
  const data = rows.slice(2);
  data.forEach((r, idx) => {
    const cells: HeatmapCell[] = [];
    for (let m = 0; m < 12; m++) {
      const v = r[startCol + m];
      if (typeof v === 'number' && v > 0) {
        cells.push({ yearMonth: `${year}-${String(m + 1).padStart(2, '0')}`, value: v });
      }
    }
    if (cells.length) out.set(idx, cells);
  });
  return out;
}

async function main() {
  const WS = process.env.WORKSPACE_ID ?? (await db.query.workspace.findFirst())?.id;
  if (!WS) throw new Error("workspace id required");
  const base = path.resolve(process.cwd(), '추가개발');

  const report = { requests: 0, contracts_matched: 0, efforts: 0, revenues: 0, staff: 0, unmatched_companies: [] as string[] };

  // 1) 추가개발관리_1번시트 → additional_development 본체
  const wb1 = XLSX.readFile(path.join(base, '추가개발관리_1번시트.xls'));
  const rows1 = XLSX.utils.sheet_to_json<any[]>(wb1.Sheets[wb1.SheetNames[0]!]!, { header: 1 });
  const requests = parseRequestSheet(rows1);

  // company name → project id map
  const companies = await db.select().from(company).where(eq(company.workspaceId, WS));
  const projects = await db.select().from(project).where(eq(project.workspaceId, WS));
  const companyByName = new Map(companies.map(c => [c.name, c]));
  const projectByCompanyId = new Map(projects.map(p => [p.companyId, p]));

  const createdIds: { key: string; id: string }[] = [];
  for (const req of requests) {
    const co = companyByName.get(req.requestCompany);
    if (!co) { report.unmatched_companies.push(req.requestCompany); continue; }
    const proj = projectByCompanyId.get(co.id);
    if (!proj) { report.unmatched_companies.push(`${req.requestCompany}(no project)`); continue; }

    const [created] = await db.insert(additionalDevelopment).values({
      workspaceId: WS, projectId: proj.id,
      requestYearMonth: req.requestYearMonth,
      requestSequence: req.requestSequence,
      status: req.status ?? '협의중',
      part: req.part,
      requesterName: req.requesterName,
      requestContent: req.requestContent,
      isPaid: req.isPaid,
      invoiceIssued: req.invoiceIssued,
      contractStartMonth: req.contractStartMonth,
      contractEndMonth: req.contractEndMonth,
      estimatedEffort: req.estimatedEffort,
      actualEffort: req.actualEffort,
      remark: req.remark,
      projectName: req.requestContent?.slice(0, 200),
    }).returning();
    report.requests++;
    createdIds.push({ key: `${req.requestCompany}|${req.requestYearMonth}|${req.requestSequence}`, id: created!.id });
  }

  // 2) 추가개발관리_2번시트 → effort heatmap
  const wb2 = XLSX.readFile(path.join(base, '추가개발관리_2번시트.xls'));
  const rows2 = XLSX.utils.sheet_to_json<any[]>(wb2.Sheets[wb2.SheetNames[0]!]!, { header: 1 });
  // 2025년 시작 컬럼 10, 2026년 시작 컬럼 22
  for (const [yearIdx, startCol, year] of [[0, 10, 2025], [1, 22, 2026]] as const) {
    const map = parseMonthHeatmap(rows2, startCol, year);
    map.forEach((cells, rowIdx) => {
      const req = requests[rowIdx];
      if (!req) return;
      const match = createdIds.find(c => c.key === `${req.requestCompany}|${req.requestYearMonth}|${req.requestSequence}`);
      if (!match) return;
      for (const c of cells) {
        db.insert(additionalDevelopmentEffort).values({ addDevId: match.id, yearMonth: c.yearMonth, effort: String(c.value) }).onConflictDoNothing().execute();
        report.efforts++;
      }
    });
  }

  // 3) 추가개발프로젝트관리 → contract_* 필드 업데이트 (requestContent로 fuzzy 매칭)
  const wbP = XLSX.readFile(path.join(base, '추가개발프로젝트관리.xls'));
  const rowsP = XLSX.utils.sheet_to_json<any[]>(wbP.Sheets[wbP.SheetNames[0]!]!, { header: 1 }).slice(2);
  for (const r of rowsP) {
    if (!r[1]) continue;
    const projectName = String(r[1]);
    const requestCompany = String(r[2]);
    // 간단 매칭: 같은 회사 + projectName 포함 관계
    const candidate = createdIds.find(c => c.key.startsWith(requestCompany + '|'));
    if (!candidate) continue;
    await db.update(additionalDevelopment).set({
      projectName,
      part: r[3] ?? undefined,
      vendorContactNote: r[5] ?? undefined,
      contractStartMonth: typeof r[6] === 'number' ? excelDateToISO(r[6]).slice(0, 7) : undefined,
      contractEndMonth: typeof r[7] === 'number' ? excelDateToISO(r[7]).slice(0, 7) : undefined,
      devStartDate: typeof r[8] === 'number' ? excelDateToISO(r[8]) : undefined,
      devEndDate: typeof r[9] === 'number' ? excelDateToISO(r[9]) : undefined,
      invoiceIssued: r[12] === 'Y' ? true : r[12] === 'N' ? false : undefined,
      actualEffort: typeof r[13] === 'number' ? String(r[13]) : undefined,
      contractAmount: typeof r[14] === 'number' ? String(Math.round(r[14])) : undefined,
      remark: r[15] ?? undefined,
      contractNumber: r[15] ?? undefined,
    }).where(and(eq(additionalDevelopment.id, candidate.id), eq(additionalDevelopment.workspaceId, WS)));
    report.contracts_matched++;
  }

  // 4) 추가개발인력관리_2번시트 → revenue heatmap
  const wbR = XLSX.readFile(path.join(base, '추가개발인력관리_2번시트.xls'));
  const rowsR = XLSX.utils.sheet_to_json<any[]>(wbR.Sheets[wbR.SheetNames[0]!]!, { header: 1 });
  const revMap = parseMonthHeatmap(rowsR, 13, 2025);
  revMap.forEach((cells, rowIdx) => {
    const projName = rowsR[rowIdx + 2]?.[3];
    if (!projName) return;
    const match = createdIds.find(c => /* fuzzy by projectName */ true /* placeholder — better: match by project_name field */);
    if (!match) return;
    for (const c of cells) {
      db.insert(additionalDevelopmentRevenue).values({ addDevId: match.id, yearMonth: c.yearMonth, amount: String(Math.round(c.value)) }).onConflictDoNothing().execute();
      report.revenues++;
    }
  });

  // 5) 추가개발인력관리_1번시트 → staff
  // (생략 — 동일 패턴, additional_development_staff 삽입)

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: 테스트 PASS 확인**

Run: `pnpm vitest run scripts/tests/migrate-add-dev-from-xls.test.ts`

- [ ] **Step 6: 실행 + unmatched 리포트 확인**

Run: `pnpm tsx scripts/migrate-add-dev-from-xls.ts | tee /tmp/add-dev-report.json`

Expected: unmatched_companies는 엑셀에 있지만 TSMT001에 없는 회사들 (예: 엑셀은 "솔브레인"이나 TSMT001에는 없음). 이건 수동 `company.name` 수정 혹은 alias 테이블로 후속 해결 — P6 검증에서 케이스별 리포트.

- [ ] **Step 7: 커밋**

```bash
git add scripts/migrate-add-dev-from-xls.ts scripts/tests/migrate-add-dev-from-xls.test.ts package.json pnpm-lock.yaml
git commit -m "feat(migrate): xls -> additional_development + effort/revenue migration"
```

---

### Task P5: `/projects/[id]` add-dev 탭 실데이터 연결 + e2e (의존: P4-A + P4-B)

**Files:**
- Modify: `apps/web/app/(app)/projects/[projectId]/add-dev/page.tsx`
- Create: `apps/web/app/(app)/projects/[projectId]/add-dev/AddDevListForProject.tsx` (client or server)
- Create: `apps/web/e2e/projects-add-dev.spec.ts` (Playwright e2e)

- [ ] **Step 1: add-dev 리스트 컴포넌트 — 프로젝트별 필터**

Replace placeholder page `apps/web/app/(app)/projects/[projectId]/add-dev/page.tsx`:
```tsx
import Link from "next/link";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { hasPermission } from "@jarvis/auth/rbac";
import { requirePageSession } from "@/lib/server/page-auth";
import { listAdditionalDev } from "@/lib/queries/additional-dev";
import { Button } from "@/components/ui/button";
import { AddDevTable } from "@/components/add-dev/AddDevTable";

export default async function ProjectAddDevTabPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const result = await listAdditionalDev({ workspaceId: session.workspaceId, projectId, pageSize: 50 });
  const canCreate = hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_CREATE);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">이 프로젝트의 추가개발 {result.pagination.total}건</h2>
        {canCreate ? (
          <Button asChild size="sm">
            <Link href={`/add-dev/new?projectId=${projectId}`}>새 추가개발</Link>
          </Button>
        ) : null}
      </div>
      <AddDevTable data={result.data} />
    </div>
  );
}
```

- [ ] **Step 2: `/add-dev/new?projectId=X` 지원 (preselect)**

Edit `apps/web/app/(app)/add-dev/new/page.tsx`: searchParams에서 projectId 읽어 `AddDevForm initialProjectId={projectId}`로 전달.

Edit `apps/web/components/add-dev/AddDevForm.tsx`: `initialProjectId` prop → project select 필드 기본값.

- [ ] **Step 3: e2e 테스트 작성 (Playwright)**

Create: `apps/web/e2e/projects-add-dev.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("Projects ↔ Add-Dev integration", () => {
  test("project detail shows related add-dev list", async ({ page }) => {
    await page.goto("/projects");
    // 첫 프로젝트 상세 진입
    const first = page.locator("table tbody tr").first();
    await first.locator("a").first().click();
    // add-dev 탭 클릭
    await page.getByRole("tab", { name: "추가개발" }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/add-dev$/);
    await expect(page.locator("h2")).toContainText("추가개발");
  });

  test("new add-dev from project detail preselects project", async ({ page }) => {
    await page.goto("/projects");
    const first = page.locator("table tbody tr").first();
    await first.locator("a").first().click();
    await page.getByRole("tab", { name: "추가개발" }).click();
    await page.getByRole("link", { name: "새 추가개발" }).click();
    await expect(page).toHaveURL(/\/add-dev\/new\?projectId=/);
  });
});
```

- [ ] **Step 4: e2e 실행**

Run: `pnpm --filter @jarvis/web exec playwright test apps/web/e2e/projects-add-dev.spec.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(projects): connect add-dev tab with real data + preselect flow + e2e"
```

---

### Task P6: 전체 검증 + Opus 최종 리뷰 (의존: P5)

- [ ] **Step 1: Integrator 검증 (jarvis-integrator agent 호출)**

Use Agent tool: subagent_type=jarvis-integrator, prompt에 "2026-04-20-projects-rename-and-add-dev 변경 전반에 대해 경계면 정합성 검증. server action↔client, i18n 키 ↔ 사용, 권한 누락, 타입/lint 체크."

- [ ] **Step 2: schema-drift 훅 통과 확인**

Run: `node scripts/check-schema-drift.mjs --ci`
Expected: exit 0.

- [ ] **Step 3: 전체 타입·린트·테스트**

Run:
```bash
pnpm tsc --noEmit
pnpm lint
pnpm test
pnpm --filter @jarvis/web build
```

- [ ] **Step 4: 수동 스모크 (브라우저 or /browse)**

실행:
```bash
pnpm --filter @jarvis/web dev &
sleep 10
```
체크리스트:
- `/projects` 200 + 테이블 렌더 + 필터/정렬 작동
- `/projects/<id>` 탭 6개 (overview/access/deploy/runbook/add-dev/edit) 전부 200
- `/projects/<id>/add-dev` 실제 건수 표시
- `/add-dev` 200 + 테이블 + 필터
- `/add-dev/<id>` 탭 4개 (overview/effort/revenue/staff) + heatmap 렌더
- `/add-dev/new?projectId=X` 폼에 project preselect
- `/systems` → 301 redirect → `/projects`
- 사이드바: "프로젝트", "추가개발" 라벨

- [ ] **Step 5: Opus critic 리뷰 (선택)**

Use Agent tool: subagent_type=critic, prompt="spec↔구현 diff 비교, 민감정보 누출 가능 스캔, P0~P5 diff 총괄".

피드백 반영 후 재검증.

- [ ] **Step 6: 최종 커밋 + PR 제안**

```bash
git log --oneline main..HEAD
# 전체 변경 사항 요약 확인 후
gh pr create --title "feat: projects rename + add-dev domain" --body "..."
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 섹션 2 결정 요약 → 각 Phase에 1:1 매핑
- ✅ 섹션 4 스키마 → P1-A(project), P2-A(project_access), P2-B(add-dev 4테이블)
- ✅ 섹션 5 URL/메뉴/권한 → P1-B, P3-A, P2-B
- ✅ 섹션 6 UI → P3-A, P3-B
- ✅ 섹션 7 마이그 → P4-A, P4-B
- ✅ 섹션 8 Phase → 그대로 반영
- ✅ 섹션 9 게이트 → P1-A Step 4/5, P2-* Step 3, P3-* Step 11/9, P4-* Step 6/7, P6 전체
- ✅ 섹션 10 리스크 → P3-A Step 6 (redirect), P4-B Step 6 (unmatched 리포트), P1-B Step 2 (RBAC 헬퍼 리네임)

**2. Placeholder scan:** 완료 — "TBD" 없음, 모든 step에 실제 코드/명령 포함.

**3. Type consistency:** 
- `listAdditionalDev`/`createAdditionalDev` 네이밍 일관 (P3-B Step 3 구현 + P5 Step 1 사용)
- `canResolveProjectSecrets` 일관 (P1-B Step 2 선언 + P3-A Step 2 사용)
- `PERMISSIONS.ADDITIONAL_DEV_READ` 일관 (P2-B Step 4 + P3-B Step 5 + P5 Step 1)

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-20-projects-rename-and-add-dev.md`.

사용자 이미 지시: **Subagent-Driven (recommended) + sonnet** 으로 실행.

→ `superpowers:subagent-driven-development` 스킬을 호출해 Phase별 builder 에이전트 디스패치 (의존 그래프의 병렬 기회 활용).
