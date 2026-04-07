# Jarvis Plan 01: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the complete monorepo skeleton, Docker stack, DB schema (32 tables), and typed package interfaces so all parallel agents can build features independently.

**Architecture:** pnpm workspace + Turborepo monorepo. PostgreSQL 16 + pgvector + pg_trgm in Docker. Drizzle ORM schema defines all 32 tables. packages/shared, auth, search, ai, secret define typed interfaces. apps/web shows AppShell with auth redirect at localhost:3000.

**Tech Stack:** pnpm 9, Turborepo 2, Next.js 15, TypeScript 5.7, Drizzle ORM 0.40, drizzle-kit 0.31, PostgreSQL 16 (pgvector/pgvector:pg16 image), Redis 7, MinIO, pg 8.13, ioredis 5.4, Tailwind CSS 4, shadcn/ui, Vitest 3

**Prerequisites:** Docker Desktop running, Node.js 22+, pnpm installed globally (`npm i -g pnpm`)

---

## File Map

```
jarvis/
├── package.json                    CREATE - root workspace
├── pnpm-workspace.yaml             CREATE
├── turbo.json                      CREATE
├── tsconfig.json                   CREATE - base TS config
├── .gitignore                      CREATE
├── .env.example                    CREATE
├── docker/
│   ├── docker-compose.yml          CREATE
│   ├── docker-compose.dev.yml      CREATE
│   └── init-db/
│       └── 01-extensions.sql       CREATE
├── packages/
│   ├── db/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   ├── drizzle.config.ts       CREATE
│   │   ├── client.ts               CREATE
│   │   └── schema/
│   │       ├── tenant.ts           CREATE
│   │       ├── user.ts             CREATE
│   │       ├── project.ts          CREATE
│   │       ├── knowledge.ts        CREATE
│   │       ├── system.ts           CREATE
│   │       ├── company.ts          CREATE
│   │       ├── attendance.ts       CREATE
│   │       ├── file.ts             CREATE
│   │       ├── menu.ts             CREATE
│   │       ├── code.ts             CREATE
│   │       ├── search.ts           CREATE
│   │       ├── audit.ts            CREATE
│   │       ├── review.ts           CREATE
│   │       └── index.ts            CREATE
│   ├── shared/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   ├── types/api.ts            CREATE
│   │   ├── types/page.ts           CREATE
│   │   ├── types/common.ts         CREATE
│   │   ├── constants/permissions.ts CREATE
│   │   └── validation/
│   │       ├── project.ts          CREATE
│   │       ├── knowledge.ts        CREATE
│   │       └── search.ts           CREATE
│   ├── auth/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   ├── types.ts                CREATE
│   │   ├── session.ts              CREATE
│   │   └── rbac.ts                 CREATE
│   ├── search/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   ├── types.ts                CREATE
│   │   └── adapter.ts              CREATE
│   ├── ai/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   └── types.ts                CREATE
│   └── secret/
│       ├── package.json            CREATE
│       ├── tsconfig.json           CREATE
│       └── types.ts                CREATE
├── apps/
│   ├── web/
│   │   ├── package.json            CREATE
│   │   ├── tsconfig.json           CREATE
│   │   ├── next.config.ts          CREATE
│   │   ├── middleware.ts           CREATE
│   │   ├── app/
│   │   │   ├── layout.tsx          CREATE
│   │   │   ├── (auth)/
│   │   │   │   ├── layout.tsx      CREATE
│   │   │   │   └── login/page.tsx  CREATE
│   │   │   └── (app)/
│   │   │       ├── layout.tsx      CREATE
│   │   │       └── dashboard/page.tsx CREATE
│   │   └── components/layout/
│   │       ├── AppShell.tsx        CREATE
│   │       ├── Sidebar.tsx         CREATE
│   │       └── Topbar.tsx          CREATE
│   └── worker/
│       ├── package.json            CREATE
│       ├── tsconfig.json           CREATE
│       └── src/index.ts            CREATE
```

---

## Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "jarvis",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "db:generate": "pnpm --filter=@jarvis/db generate",
    "db:migrate": "pnpm --filter=@jarvis/db migrate",
    "db:studio": "pnpm --filter=@jarvis/db studio",
    "db:push": "pnpm --filter=@jarvis/db push"
  },
  "devDependencies": {
    "turbo": "^2.3.3",
    "typescript": "^5.7.3",
    "@types/node": "^22.10.0"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$"]
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    },
    "generate": {
      "cache": false
    },
    "migrate": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
# Dependencies
node_modules/
.pnpm-store/

# Build
.next/
dist/
out/

# Env
.env
.env.local
.env.production

# Turbo
.turbo/

# Drizzle
drizzle/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
```

- [ ] **Step 6: Install and verify**

```bash
pnpm install
```

Expected: `Packages: +N ✓` with no errors.

---

## Task 2: Docker Compose + DB init

**Files:**
- Create: `docker/docker-compose.yml`
- Create: `docker/docker-compose.dev.yml`
- Create: `docker/init-db/01-extensions.sql`
- Create: `.env.example`

- [ ] **Step 1: Create docker/init-db/01-extensions.sql**

```sql
-- Run once on DB initialization
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

- [ ] **Step 2: Create docker/docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: jarvis-postgres
    environment:
      POSTGRES_DB: jarvis
      POSTGRES_USER: jarvis
      POSTGRES_PASSWORD: jarvispass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jarvis -d jarvis"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: jarvis-redis
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    container_name: jarvis-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: jarvisadmin
      MINIO_ROOT_PASSWORD: jarvispassword
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  miniodata:
```

- [ ] **Step 3: Create docker/docker-compose.dev.yml** (inherits from main, adds port bindings for dev tools)

```yaml
include:
  - docker-compose.yml

services:
  postgres:
    ports:
      - "5432:5432"
  redis:
    ports:
      - "6379:6379"
  minio:
    ports:
      - "9000:9000"
      - "9001:9001"
```

- [ ] **Step 4: Create .env.example** (copy to .env for local dev)

```bash
# Database
DATABASE_URL=postgresql://jarvis:jarvispass@localhost:5432/jarvis

# Redis
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=jarvisadmin
MINIO_SECRET_KEY=jarvispassword
MINIO_BUCKET=jarvis

# Auth (SSO - replace with real values)
OIDC_ISSUER=http://localhost:8080/realms/jarvis
OIDC_CLIENT_ID=jarvis-web
OIDC_CLIENT_SECRET=change-me-in-prod
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-prod-32chars!!

# App
NEXT_PUBLIC_APP_NAME=Jarvis
NEXT_PUBLIC_APP_URL=http://localhost:3000

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Session
SESSION_SECRET=dev-session-secret-32-chars-min!!

# SOPS (secret management)
# SOPS_AGE_KEY_FILE=~/.sops/jarvis-age.key
```

- [ ] **Step 5: Start Docker services and verify**

```bash
# From project root
cp .env.example .env
cd docker
docker compose up -d
docker compose ps
```

Expected output: All 3 services show `Up (healthy)`.

```bash
# Verify PostgreSQL extensions
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT extname FROM pg_extension;"
```

Expected: `vector`, `pg_trgm`, `unaccent`, `uuid-ossp` in results.

---

## Task 3: packages/db — setup + custom types

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/client.ts`

- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "@jarvis/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./schema": "./schema/index.ts",
    "./client": "./client.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "push": "drizzle-kit push",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "drizzle-orm": "^0.40.0",
    "pg": "^8.13.3",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create packages/db/drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export default defineConfig({
  schema: './schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://jarvis:jarvispass@localhost:5432/jarvis',
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 4: Create packages/db/client.ts** (singleton Drizzle client)

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ??
    'postgresql://jarvis:jarvispass@localhost:5432/jarvis',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema, logger: process.env['NODE_ENV'] === 'development' });
export type DB = typeof db;
export { schema };
```

---

## Task 4: packages/db — Tenant & User schema

**Files:**
- Create: `packages/db/schema/tenant.ts`
- Create: `packages/db/schema/user.ts`

- [ ] **Step 1: Create packages/db/schema/tenant.ts**

```typescript
import {
  pgTable, uuid, varchar, jsonb, timestamp, boolean, integer
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  settings: jsonb('settings').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  parentId: uuid('parent_id'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const workspaceRelations = relations(workspace, ({ many }) => ({
  organizations: many(organization),
}));

export const organizationRelations = relations(organization, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [organization.workspaceId],
    references: [workspace.id],
  }),
  parent: one(organization, {
    fields: [organization.parentId],
    references: [organization.id],
    relationName: 'parent_child',
  }),
  children: many(organization, { relationName: 'parent_child' }),
}));
```

- [ ] **Step 2: Create packages/db/schema/user.ts**

```typescript
import {
  pgTable, uuid, varchar, text, boolean, timestamp, jsonb, primaryKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspace, organization } from './tenant.js';

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  employeeId: varchar('employee_id', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  orgId: uuid('org_id').references(() => organization.id),
  position: varchar('position', { length: 100 }),
  isActive: boolean('is_active').default(true),
  ssoSubject: varchar('sso_subject', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  preferences: jsonb('preferences').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const role = pgTable('role', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const permission = pgTable('permission', {
  id: uuid('id').primaryKey().defaultRandom(),
  resource: varchar('resource', { length: 100 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
});

export const userRole = pgTable('user_role', {
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => role.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.roleId] }),
}));

export const rolePermission = pgTable('role_permission', {
  roleId: uuid('role_id').notNull().references(() => role.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permission.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  workspace: one(workspace, { fields: [user.workspaceId], references: [workspace.id] }),
  org: one(organization, { fields: [user.orgId], references: [organization.id] }),
  userRoles: many(userRole),
}));

export const roleRelations = relations(role, ({ many }) => ({
  userRoles: many(userRole),
  rolePermissions: many(rolePermission),
}));
```

---

## Task 5: packages/db — Project schema

**Files:**
- Create: `packages/db/schema/project.ts`

- [ ] **Step 1: Create packages/db/schema/project.ts**

```typescript
import {
  pgTable, uuid, varchar, text, boolean, date, numeric, integer, timestamp, check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { workspace } from './tenant.js';
import { user } from './user.js';
import { company } from './company.js';

export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  name: varchar('name', { length: 300 }).notNull(),
  clientCompanyId: uuid('client_company_id'),
  partCode: varchar('part_code', { length: 50 }),
  partName: varchar('part_name', { length: 200 }),
  headcount: integer('headcount'),
  contractStart: date('contract_start'),
  contractEnd: date('contract_end'),
  devStart: date('dev_start'),
  devEnd: date('dev_end'),
  inspectionDone: boolean('inspection_done').default(false),
  contractPrice: numeric('contract_price', { precision: 15, scale: 2 }),
  taxInvoiceDone: boolean('tax_invoice_done').default(false),
  remark: text('remark'),
  status: varchar('status', { length: 30 }).default('active').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projectTask = pgTable('project_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  requestSeq: integer('request_seq'),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content'),
  status: varchar('status', { length: 30 }).default('requested').notNull(),
  managerId: uuid('manager_id'),
  developerId: uuid('developer_id'),
  isOutsourced: boolean('is_outsourced').default(false),
  isPaid: boolean('is_paid').default(false),
  paidContent: text('paid_content'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  estimatedMm: numeric('estimated_mm', { precision: 5, scale: 2 }),
  actualMm: numeric('actual_mm', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projectInquiry = pgTable('project_inquiry', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  projectId: uuid('project_id'),
  clientCompanyId: uuid('client_company_id'),
  content: text('content').notNull(),
  desiredDate: date('desired_date'),
  estimatedMm: numeric('estimated_mm', { precision: 5, scale: 2 }),
  status: varchar('status', { length: 30 }).default('pending').notNull(),
  salesPerson: varchar('sales_person', { length: 100 }),
  chargePerson: varchar('charge_person', { length: 100 }),
  confirmed: boolean('confirmed').default(false),
  projectName: varchar('project_name', { length: 300 }),
  remark: text('remark'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projectStaff = pgTable('project_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => user.id),
  role: varchar('role', { length: 100 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
});

export const projectRelations = relations(project, ({ many }) => ({
  tasks: many(projectTask),
  inquiries: many(projectInquiry),
  staff: many(projectStaff),
}));

export const projectTaskRelations = relations(projectTask, ({ one }) => ({
  project: one(project, { fields: [projectTask.projectId], references: [project.id] }),
}));
```

---

## Task 6: packages/db — Knowledge, System, Company, Attendance, File schema

**Files:**
- Create: `packages/db/schema/knowledge.ts`
- Create: `packages/db/schema/system.ts`
- Create: `packages/db/schema/company.ts`
- Create: `packages/db/schema/attendance.ts`
- Create: `packages/db/schema/file.ts`

- [ ] **Step 1: Create packages/db/schema/knowledge.ts**

```typescript
import {
  pgTable, uuid, varchar, text, boolean, integer, timestamp, primaryKey, customType
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { workspace } from './tenant.js';
import { user } from './user.js';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(1536)',
  fromDriver: (v: string) => v.slice(1, -1).split(',').map(Number),
  toDriver: (v: number[]) => `[${v.join(',')}]`,
});

// Custom type for tsvector
const tsvectorType = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const knowledgePage = pgTable('knowledge_page', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  pageType: varchar('page_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull(),
  body: text('body').default('').notNull(),
  summary: text('summary'),
  sensitivity: varchar('sensitivity', { length: 30 }).default('INTERNAL').notNull(),
  freshnessSLADays: integer('freshness_sla_days').default(90),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  reviewStatus: varchar('review_status', { length: 30 }).default('draft').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  searchVector: tsvectorType('search_vector'),
  embedding: vector('embedding'),
});

export const knowledgePageVersion = pgTable('knowledge_page_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => knowledgePage.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  diffSummary: text('diff_summary'),
  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const knowledgeClaim = pgTable('knowledge_claim', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => knowledgePage.id, { onDelete: 'cascade' }),
  claimText: text('claim_text').notNull(),
  sourceRefId: uuid('source_ref_id'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  verified: boolean('verified').default(false),
  verifiedBy: uuid('verified_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const knowledgePageOwner = pgTable('knowledge_page_owner', {
  pageId: uuid('page_id').notNull().references(() => knowledgePage.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => user.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.pageId, t.userId] }),
}));

export const knowledgePageTag = pgTable('knowledge_page_tag', {
  pageId: uuid('page_id').notNull().references(() => knowledgePage.id, { onDelete: 'cascade' }),
  tag: varchar('tag', { length: 100 }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.pageId, t.tag] }),
}));

export const knowledgePageRelations = relations(knowledgePage, ({ many }) => ({
  versions: many(knowledgePageVersion),
  claims: many(knowledgeClaim),
  owners: many(knowledgePageOwner),
  tags: many(knowledgePageTag),
}));
```

- [ ] **Step 2: Create packages/db/schema/system.ts**

```typescript
import {
  pgTable, uuid, varchar, text, integer, timestamp
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspace } from './tenant.js';
import { company } from './company.js';

export const system = pgTable('system', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  name: varchar('name', { length: 300 }).notNull(),
  companyId: uuid('company_id'),
  category: varchar('category', { length: 50 }),
  environment: varchar('environment', { length: 30 }),
  status: varchar('status', { length: 30 }).default('active').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const systemAccess = pgTable('system_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemId: uuid('system_id').notNull().references(() => system.id, { onDelete: 'cascade' }),
  accessType: varchar('access_type', { length: 50 }).notNull(),
  endpoint: varchar('endpoint', { length: 500 }),
  loginGuide: text('login_guide'),
  secretRef: varchar('secret_ref', { length: 500 }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const systemRelations = relations(system, ({ many }) => ({
  accessEntries: many(systemAccess),
}));
```

- [ ] **Step 3: Create packages/db/schema/company.ts**

```typescript
import { pgTable, uuid, varchar, text, date, timestamp } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';

export const company = pgTable('company', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 300 }).notNull(),
  groupCode: varchar('group_code', { length: 50 }),
  category: varchar('category', { length: 50 }),
  representative: varchar('representative', { length: 100 }),
  startDate: date('start_date'),
  industryCode: varchar('industry_code', { length: 50 }),
  address: text('address'),
  homepage: varchar('homepage', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 4: Create packages/db/schema/attendance.ts**

```typescript
import { pgTable, uuid, varchar, date, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspace } from './tenant.js';
import { user } from './user.js';

export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  userId: uuid('user_id').notNull().references(() => user.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  leaveType: varchar('leave_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 30 }).default('pending').notNull(),
  note: text('note'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
  approvedBy: uuid('approved_by').references(() => user.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const outManage = pgTable('out_manage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  userId: uuid('user_id').notNull().references(() => user.id),
  date: date('date').notNull(),
  serviceCount: integer('service_count').default(0),
  totalCount: integer('total_count').default(0),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const outManageDetail = pgTable('out_manage_detail', {
  id: uuid('id').primaryKey().defaultRandom(),
  outManageId: uuid('out_manage_id').notNull().references(() => outManage.id, { onDelete: 'cascade' }),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const outManageRelations = relations(outManage, ({ many }) => ({
  details: many(outManageDetail),
}));
```

- [ ] **Step 5: Create packages/db/schema/file.ts**

```typescript
import { pgTable, uuid, varchar, text, bigint, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { user } from './user.js';

export const rawSource = pgTable('raw_source', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  sourceType: varchar('source_type', { length: 30 }).notNull(),
  originalName: varchar('original_name', { length: 500 }),
  storageKey: varchar('storage_key', { length: 1000 }),
  mimeType: varchar('mime_type', { length: 200 }),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  checksum: varchar('checksum', { length: 128 }),
  parsedText: text('parsed_text'),
  metadata: jsonb('metadata').default('{}'),
  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const attachment = pgTable('attachment', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  rawSourceId: uuid('raw_source_id').notNull().references(() => rawSource.id),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

---

## Task 7: packages/db — Menu, Code, Search, Audit, Review schema

**Files:**
- Create: `packages/db/schema/menu.ts`
- Create: `packages/db/schema/code.ts`
- Create: `packages/db/schema/search.ts`
- Create: `packages/db/schema/audit.ts`
- Create: `packages/db/schema/review.ts`
- Create: `packages/db/schema/index.ts`

- [ ] **Step 1: Create packages/db/schema/menu.ts**

```typescript
import { pgTable, uuid, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';

export const menuItem = pgTable('menu_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  parentId: uuid('parent_id'),
  label: varchar('label', { length: 200 }).notNull(),
  icon: varchar('icon', { length: 100 }),
  routePath: varchar('route_path', { length: 300 }),
  sortOrder: integer('sort_order').default(0),
  isVisible: boolean('is_visible').default(true),
  requiredRole: varchar('required_role', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Create packages/db/schema/code.ts**

```typescript
import { pgTable, uuid, varchar, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workspace } from './tenant.js';

export const codeGroup = pgTable('code_group', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  isActive: boolean('is_active').default(true),
});

export const codeItem = pgTable('code_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => codeGroup.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  metadata: jsonb('metadata').default('{}'),
});

export const codeGroupRelations = relations(codeGroup, ({ many }) => ({
  items: many(codeItem),
}));
```

- [ ] **Step 3: Create packages/db/schema/search.ts**

```typescript
import { pgTable, uuid, varchar, text, integer, date, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { user } from './user.js';

export const searchLog = pgTable('search_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  userId: uuid('user_id').references(() => user.id),
  query: text('query').notNull(),
  filters: jsonb('filters'),
  resultCount: integer('result_count'),
  clickedPageId: uuid('clicked_page_id'),
  clickedRank: integer('clicked_rank'),
  responseMs: integer('response_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const searchSynonym = pgTable('search_synonym', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  term: varchar('term', { length: 200 }).notNull(),
  synonyms: varchar('synonyms', { length: 200 }).array().notNull(),
});

export const popularSearch = pgTable('popular_search', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  query: varchar('query', { length: 500 }).notNull(),
  count: integer('count').default(0),
  period: date('period').notNull(),
});
```

- [ ] **Step 4: Create packages/db/schema/audit.ts**

```typescript
import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, customType, inet } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { user } from './user.js';

const tsvectorType = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  userId: uuid('user_id').references(() => user.id),
  action: varchar('action', { length: 50 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  details: jsonb('details').default('{}'),
  success: boolean('success').default(true),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  searchVector: tsvectorType('search_vector'),
});
```

- [ ] **Step 5: Create packages/db/schema/review.ts**

```typescript
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { user } from './user.js';
import { knowledgePage } from './knowledge.js';

export const reviewRequest = pgTable('review_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  pageId: uuid('page_id').references(() => knowledgePage.id, { onDelete: 'set null' }),
  requestedBy: uuid('requested_by').notNull().references(() => user.id),
  reviewerId: uuid('reviewer_id').references(() => user.id),
  status: varchar('status', { length: 30 }).default('pending').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
```

- [ ] **Step 6: Create packages/db/schema/index.ts** (re-export all)

```typescript
export * from './tenant.js';
export * from './user.js';
export * from './project.js';
export * from './knowledge.js';
export * from './system.js';
export * from './company.js';
export * from './attendance.js';
export * from './file.js';
export * from './menu.js';
export * from './code.js';
export * from './search.js';
export * from './audit.js';
export * from './review.js';
```

- [ ] **Step 7: Install packages/db dependencies and run migration**

```bash
cd packages/db
pnpm install
pnpm generate
pnpm migrate
```

Expected: Migration completes. `drizzle/` folder created with SQL migration files. All 32 tables created in PostgreSQL.

```bash
# Verify tables
docker exec jarvis-postgres psql -U jarvis -d jarvis -c "\dt"
```

Expected: 32 tables listed.

---

## Task 8: packages/shared — types and validation

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/types/api.ts`
- Create: `packages/shared/types/page.ts`
- Create: `packages/shared/types/common.ts`
- Create: `packages/shared/constants/permissions.ts`
- Create: `packages/shared/validation/project.ts`
- Create: `packages/shared/validation/knowledge.ts`
- Create: `packages/shared/validation/search.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@jarvis/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./types": "./types/index.ts",
    "./constants": "./constants/index.ts",
    "./validation": "./validation/index.ts"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create packages/shared/types/api.ts**

```typescript
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;      // 1-indexed
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function apiOk<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return { data, ...(meta ? { meta } : {}) };
}

export function apiError(code: ErrorCode, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
```

- [ ] **Step 4: Create packages/shared/types/page.ts**

```typescript
export const PAGE_TYPES = [
  'project', 'system', 'access', 'runbook', 'onboarding',
  'hr-policy', 'tool-guide', 'faq', 'decision', 'incident',
  'analysis', 'glossary',
] as const;

export type PageType = typeof PAGE_TYPES[number];

export const SENSITIVITY_LEVELS = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'SECRET_REF_ONLY'] as const;
export type Sensitivity = typeof SENSITIVITY_LEVELS[number];

export const REVIEW_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const SENSITIVITY_ORDER: Record<Sensitivity, number> = {
  PUBLIC: 0, INTERNAL: 1, RESTRICTED: 2, SECRET_REF_ONLY: 3,
};
```

- [ ] **Step 5: Create packages/shared/types/common.ts**

```typescript
export type UUID = string;

export interface PaginationParams {
  page?: number;    // 1-indexed, default 1
  pageSize?: number; // default 20
  sort?: string;    // e.g. "created_at:desc"
}

export function parsePagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}
```

- [ ] **Step 6: Create packages/shared/constants/permissions.ts**

```typescript
export const PERMISSIONS = {
  KNOWLEDGE_READ: 'knowledge.page:read',
  KNOWLEDGE_WRITE: 'knowledge.page:write',
  KNOWLEDGE_REVIEW: 'knowledge.page:review',
  KNOWLEDGE_ADMIN: 'knowledge.page:admin',
  PROJECT_READ: 'project:read',
  PROJECT_WRITE: 'project:write',
  PROJECT_ADMIN: 'project:admin',
  SYSTEM_READ: 'system:read',
  SYSTEM_WRITE: 'system:write',
  SYSTEM_ACCESS_SECRET: 'system.access:secret',
  USER_READ: 'admin:users:read',
  USER_WRITE: 'admin:users:write',
  AUDIT_READ: 'admin:audit:read',
  ADMIN_ALL: 'admin:all',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: Object.values(PERMISSIONS) as Permission[],
  MANAGER: [
    PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.KNOWLEDGE_WRITE, PERMISSIONS.KNOWLEDGE_REVIEW,
    PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.USER_READ,
  ],
  DEVELOPER: [
    PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.KNOWLEDGE_WRITE,
    PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.SYSTEM_READ, PERMISSIONS.SYSTEM_ACCESS_SECRET,
  ],
  HR: [
    PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.KNOWLEDGE_WRITE,
    PERMISSIONS.USER_READ,
  ],
  VIEWER: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.PROJECT_READ, PERMISSIONS.SYSTEM_READ],
};
```

- [ ] **Step 7: Create packages/shared/validation/knowledge.ts**

```typescript
import { z } from 'zod';
import { PAGE_TYPES, SENSITIVITY_LEVELS } from '../types/page.js';

export const createKnowledgePageSchema = z.object({
  pageType: z.enum(PAGE_TYPES),
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(500).regex(/^[a-z0-9-]+$/),
  body: z.string().default(''),
  summary: z.string().max(2000).optional(),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default('INTERNAL'),
  freshnessSLADays: z.number().int().min(0).default(90),
  tags: z.array(z.string().max(100)).default([]),
  secretRefs: z.array(z.string()).default([]),
});

export const updateKnowledgePageSchema = createKnowledgePageSchema.partial();
export type CreateKnowledgePage = z.infer<typeof createKnowledgePageSchema>;
export type UpdateKnowledgePage = z.infer<typeof updateKnowledgePageSchema>;
```

- [ ] **Step 8: Create packages/shared/validation/search.ts**

```typescript
import { z } from 'zod';
import { PAGE_TYPES, SENSITIVITY_LEVELS } from '../types/page.js';

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    pageType: z.array(z.enum(PAGE_TYPES)).optional(),
    sensitivity: z.array(z.enum(SENSITIVITY_LEVELS)).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }).optional(),
  sort: z.enum(['relevance', 'newest', 'freshness', 'hybrid']).default('hybrid'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  explain: z.boolean().default(false),
  highlight: z.boolean().default(true),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
```

---

## Task 9: packages/auth, search, ai, secret interfaces

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/types.ts`
- Create: `packages/auth/session.ts`
- Create: `packages/auth/rbac.ts`
- Create: `packages/search/package.json`
- Create: `packages/search/tsconfig.json`
- Create: `packages/search/types.ts`
- Create: `packages/search/adapter.ts`
- Create: `packages/ai/package.json`
- Create: `packages/ai/types.ts`
- Create: `packages/secret/package.json`
- Create: `packages/secret/types.ts`

- [ ] **Step 1: Create packages/auth/package.json**

```json
{
  "name": "@jarvis/auth",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.ts" },
  "dependencies": {
    "ioredis": "^5.4.2",
    "@jarvis/shared": "workspace:*"
  },
  "devDependencies": { "typescript": "^5.7.3" }
}
```

- [ ] **Step 2: Create packages/auth/types.ts**

```typescript
export interface JarvisSession {
  id: string;               // session ID (stored in Redis)
  userId: string;
  workspaceId: string;
  employeeId: string;
  name: string;
  email?: string;
  roles: string[];          // role codes: ['DEVELOPER', 'ADMIN', ...]
  permissions: string[];    // flat list from ROLE_PERMISSIONS
  orgId?: string;
  ssoSubject: string;
  createdAt: number;        // epoch ms
  expiresAt: number;        // epoch ms
}

export interface AuthContext {
  session: JarvisSession;
  isAuthenticated: true;
}

export interface UnauthContext {
  isAuthenticated: false;
}

export type RequestContext = AuthContext | UnauthContext;

export function isAuth(ctx: RequestContext): ctx is AuthContext {
  return ctx.isAuthenticated;
}
```

- [ ] **Step 3: Create packages/auth/session.ts** (Redis session store)

```typescript
import Redis from 'ioredis';
import type { JarvisSession } from './types.js';

const SESSION_TTL = 60 * 60 * 8; // 8 hours
const SESSION_PREFIX = 'jarvis:session:';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }
  return redis;
}

export async function createSession(session: JarvisSession): Promise<void> {
  await getRedis().setex(
    `${SESSION_PREFIX}${session.id}`,
    SESSION_TTL,
    JSON.stringify(session)
  );
}

export async function getSession(sessionId: string): Promise<JarvisSession | null> {
  const raw = await getRedis().get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw) as JarvisSession;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getRedis().del(`${SESSION_PREFIX}${sessionId}`);
}

export async function refreshSession(sessionId: string): Promise<void> {
  await getRedis().expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);
}
```

- [ ] **Step 4: Create packages/auth/rbac.ts**

```typescript
import type { JarvisSession } from './types.js';

export function hasPermission(session: JarvisSession, permission: string): boolean {
  return session.permissions.includes(permission);
}

export function hasRole(session: JarvisSession, roleCode: string): boolean {
  return session.roles.includes(roleCode);
}

export function isAdmin(session: JarvisSession): boolean {
  return session.roles.includes('ADMIN');
}

export function canAccessSensitivity(
  session: JarvisSession,
  sensitivity: 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'SECRET_REF_ONLY'
): boolean {
  if (sensitivity === 'PUBLIC') return true;
  if (sensitivity === 'INTERNAL') return session.permissions.includes('knowledge.page:read');
  if (sensitivity === 'RESTRICTED') return session.roles.some(r => ['ADMIN', 'MANAGER', 'DEVELOPER'].includes(r));
  if (sensitivity === 'SECRET_REF_ONLY') return session.roles.includes('ADMIN') || session.roles.includes('DEVELOPER');
  return false;
}
```

- [ ] **Step 5: Create packages/search/types.ts**

```typescript
export interface SearchQuery {
  query: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  filters?: {
    pageType?: string[];
    sensitivity?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  sort?: 'relevance' | 'newest' | 'freshness' | 'hybrid';
  page?: number;
  pageSize?: number;
  highlight?: boolean;
  explain?: boolean;
}

export interface SearchResultItem {
  id: string;
  pageType: string;
  title: string;          // with <mark> tags if highlight=true
  snippet: string;        // with <mark> tags
  sensitivity: string;
  score: number;
  scores?: ScoreBreakdown;
  updatedAt: string;
  owners: string[];
  tags: string[];
}

export interface ScoreBreakdown {
  keyword: number;
  vector: number;
  trgm: number;
  freshness: number;
  final: number;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    pageType: FacetCount[];
    sensitivity: FacetCount[];
  };
  suggestions: string[];
}
```

- [ ] **Step 6: Create packages/search/adapter.ts**

```typescript
import type { SearchQuery, SearchResult } from './types.js';

export interface SearchAdapter {
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(prefix: string, workspaceId: string): Promise<string[]>;
  indexPage(pageId: string): Promise<void>;
  deletePage(pageId: string): Promise<void>;
}

// Factory — returns the configured adapter (PG now, OS later)
let _adapter: SearchAdapter | null = null;

export function setSearchAdapter(adapter: SearchAdapter): void {
  _adapter = adapter;
}

export function getSearchAdapter(): SearchAdapter {
  if (!_adapter) throw new Error('Search adapter not initialized. Call setSearchAdapter() first.');
  return _adapter;
}
```

- [ ] **Step 7: Create packages/ai/types.ts**

```typescript
export interface SourceRef {
  pageId: string;
  pageTitle: string;
  pageType: string;
  relevance: number;
}

export interface Claim {
  text: string;
  source: SourceRef;
  confidence: number;
}

export interface AskResult {
  answer: string;
  claims: Claim[];
  relatedPages: SourceRef[];
}

export interface EmbeddingResult {
  pageId: string;
  embedding: number[];
}
```

- [ ] **Step 8: Create packages/secret/types.ts**

```typescript
export type SecretRef = string;  // format: vault://jarvis/{workspace}/{system}/{key}

export interface SecretResolver {
  resolve(ref: SecretRef, workspaceId: string): Promise<string>;
}

export interface ResolvedSecret {
  ref: SecretRef;
  value: string;
  resolvedAt: Date;
}

// SOPS adapter (MVP) - reads from encrypted YAML
export function createEnvSecretResolver(): SecretResolver {
  return {
    async resolve(ref: SecretRef): Promise<string> {
      // MVP: map secret_ref to env var name
      // vault://jarvis/ws-001/jenkins/password → JARVIS_WS_001_JENKINS_PASSWORD
      const key = ref
        .replace('vault://jarvis/', '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toUpperCase();
      const value = process.env[key];
      if (!value) throw new Error(`Secret not found: ${ref} (env key: ${key})`);
      return value;
    },
  };
}
```

---

## Task 10: apps/web — Next.js scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/app/layout.tsx`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@jarvis/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.2.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@jarvis/db": "workspace:*",
    "@jarvis/shared": "workspace:*",
    "@jarvis/auth": "workspace:*",
    "@jarvis/search": "workspace:*",
    "@jarvis/ai": "workspace:*",
    "@jarvis/secret": "workspace:*",
    "zod": "^3.24.1",
    "react-hook-form": "^7.54.2",
    "@hookform/resolvers": "^3.9.1",
    "@tanstack/react-table": "^8.21.2",
    "lucide-react": "^0.468.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "ioredis": "^5.4.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.3",
    "@tailwindcss/postcss": "^4.1.3",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.2.4",
    "vitest": "^3.1.1",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  transpilePackages: ['@jarvis/db', '@jarvis/shared', '@jarvis/auth', '@jarvis/search', '@jarvis/ai', '@jarvis/secret'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/middleware.ts** (auth guard)

```typescript
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/callback', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API health check
  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionId = request.cookies.get('jarvis_session')?.value;
  if (!sessionId) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Add session ID to headers for use in server components
  const response = NextResponse.next();
  response.headers.set('x-session-id', sessionId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 5: Create apps/web/app/layout.tsx** (root layout)

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Jarvis',
  description: 'Enterprise Internal Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create apps/web/app/globals.css** (Tailwind v4)

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --radius: 0.5rem;
    --sidebar-width: 240px;
    --topbar-height: 56px;
  }
  * { border-color: hsl(var(--border)); }
  body { background: hsl(var(--background)); color: hsl(var(--foreground)); }
}
```

---

## Task 11: apps/web — Auth pages + AppShell layout

**Files:**
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(app)/layout.tsx`
- Create: `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/components/layout/AppShell.tsx`
- Create: `apps/web/components/layout/Sidebar.tsx`
- Create: `apps/web/components/layout/Topbar.tsx`

- [ ] **Step 1: Create apps/web/app/(auth)/layout.tsx**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/web/app/(auth)/login/page.tsx**

```tsx
import { redirect } from 'next/navigation';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const redirectTo = searchParams.redirect ?? '/dashboard';

  return (
    <div className="bg-white rounded-lg shadow-md p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Jarvis</h1>
        <p className="text-gray-500 mt-1">사내 포털에 로그인하세요</p>
      </div>
      <a
        href={`/api/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
        className="block w-full text-center bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        SSO로 로그인
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Create apps/web/components/layout/Sidebar.tsx**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Server, BookOpen,
  Search, MessageSquare, Calendar, User, Settings, ShieldCheck
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/projects', label: '프로젝트', icon: FolderKanban },
  { href: '/systems', label: '시스템', icon: Server },
  { href: '/knowledge', label: '지식베이스', icon: BookOpen },
  { href: '/search', label: '검색', icon: Search },
  { href: '/ask', label: 'Ask AI', icon: MessageSquare },
  { href: '/attendance', label: '근태', icon: Calendar },
  { href: '/profile', label: '프로필', icon: User },
];

const adminItems = [
  { href: '/admin', label: '관리자', icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-[var(--topbar-height)] bottom-0 w-[var(--sidebar-width)] bg-gray-900 text-white flex flex-col overflow-y-auto z-40">
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith(href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-gray-700">
        {adminItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith(href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Create apps/web/components/layout/Topbar.tsx**

```tsx
'use client';

import Link from 'next/link';
import { Search, Bell, ChevronDown } from 'lucide-react';

interface TopbarProps {
  userName: string;
}

export function Topbar({ userName }: TopbarProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 h-[var(--topbar-height)] bg-white border-b border-gray-200 flex items-center px-4 z-50"
    >
      <div className="flex items-center gap-3 w-[var(--sidebar-width)] pr-4">
        <Link href="/dashboard" className="font-bold text-xl text-blue-600">Jarvis</Link>
      </div>

      <div className="flex-1 max-w-lg">
        <Link
          href="/search"
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-gray-500 text-sm hover:bg-gray-200 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>검색...</span>
          <kbd className="ml-auto text-xs bg-gray-200 px-1.5 py-0.5 rounded">⌘K</kbd>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="p-2 hover:bg-gray-100 rounded-lg relative">
          <Bell className="w-5 h-5 text-gray-600" />
        </button>
        <Link
          href="/profile"
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg"
        >
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
            {userName.charAt(0)}
          </div>
          <span className="text-sm text-gray-700">{userName}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Create apps/web/app/(app)/layout.tsx** (AppShell)

```tsx
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@jarvis/auth/session';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionId = (await headers()).get('x-session-id') ??
    (await cookies()).get('jarvis_session')?.value;

  if (!sessionId) redirect('/login');

  const session = await getSession(sessionId);
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar userName={session.name} />
      <Sidebar />
      <main
        className="pt-[var(--topbar-height)] pl-[var(--sidebar-width)] min-h-screen"
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Create apps/web/app/(app)/dashboard/page.tsx** (placeholder)

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">대시보드</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['프로젝트', '지식 페이지', '검색', 'Ask AI'].map(item => (
          <div key={item} className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-500 text-sm">{item}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Task 12: apps/web — Auth API routes

**Files:**
- Create: `apps/web/app/api/auth/login/route.ts`
- Create: `apps/web/app/api/auth/callback/route.ts`
- Create: `apps/web/app/api/auth/logout/route.ts`
- Create: `apps/web/app/api/health/route.ts`

- [ ] **Step 1: Create apps/web/app/api/health/route.ts**

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'jarvis-web',
  });
}
```

- [ ] **Step 2: Create apps/web/app/api/auth/login/route.ts** (redirects to SSO)

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';

  const issuer = process.env['OIDC_ISSUER'] ?? 'http://localhost:8080/realms/jarvis';
  const clientId = process.env['OIDC_CLIENT_ID'] ?? 'jarvis-web';
  const appUrl = process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000';

  // Store redirect in cookie for callback
  const state = Buffer.from(JSON.stringify({ redirect: redirectTo })).toString('base64url');

  const authUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', `${appUrl}/api/auth/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('oidc_state', state, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });
  return response;
}
```

- [ ] **Step 3: Create apps/web/app/api/auth/callback/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@jarvis/auth/session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { schema } from '@jarvis/db/client';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=missing_params', request.url));
  }

  const issuer = process.env['OIDC_ISSUER'] ?? 'http://localhost:8080/realms/jarvis';
  const clientId = process.env['OIDC_CLIENT_ID'] ?? 'jarvis-web';
  const clientSecret = process.env['OIDC_CLIENT_SECRET'] ?? '';
  const appUrl = process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000';

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${appUrl}/api/auth/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokens = await tokenRes.json() as {
      access_token: string; id_token: string; refresh_token: string;
    };

    // Decode ID token to get user info
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split('.')[1]!, 'base64url').toString()
    ) as { sub: string; name: string; email: string; preferred_username: string };

    // Look up or create user in DB
    const [dbUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.ssoSubject, payload.sub))
      .limit(1);

    if (!dbUser) {
      return NextResponse.redirect(new URL('/login?error=user_not_found', request.url));
    }

    // Get user roles
    const userRoleRows = await db
      .select({ roleCode: schema.role.code })
      .from(schema.userRole)
      .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
      .where(eq(schema.userRole.userId, dbUser.id));

    const roles = userRoleRows.map(r => r.roleCode);
    const permissions = [...new Set(roles.flatMap(r => ROLE_PERMISSIONS[r] ?? []))];

    const sessionId = randomUUID();
    const now = Date.now();

    await createSession({
      id: sessionId,
      userId: dbUser.id,
      workspaceId: dbUser.workspaceId,
      employeeId: dbUser.employeeId,
      name: dbUser.name,
      email: dbUser.email ?? undefined,
      roles,
      permissions,
      orgId: dbUser.orgId ?? undefined,
      ssoSubject: payload.sub,
      createdAt: now,
      expiresAt: now + 8 * 60 * 60 * 1000,
    });

    let redirectTo = '/dashboard';
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString()) as { redirect: string };
      redirectTo = stateData.redirect ?? '/dashboard';
    } catch { /* ignore */ }

    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    response.cookies.set('jarvis_session', sessionId, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 8 * 60 * 60,
      sameSite: 'lax',
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Auth callback error:', err);
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
  }
}
```

- [ ] **Step 4: Create apps/web/app/api/auth/logout/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@jarvis/auth/session';

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('jarvis_session')?.value;
  if (sessionId) {
    await deleteSession(sessionId);
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('jarvis_session');
  return response;
}
```

---

## Task 13: apps/worker scaffold

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`

- [ ] **Step 1: Create apps/worker/package.json**

```json
{
  "name": "@jarvis/worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/src/index.js"
  },
  "dependencies": {
    "pg-boss": "^10.1.3",
    "@jarvis/db": "workspace:*",
    "@jarvis/shared": "workspace:*",
    "@jarvis/ai": "workspace:*",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2"
  }
}
```

- [ ] **Step 2: Create apps/worker/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create apps/worker/src/index.ts**

```typescript
import 'dotenv/config';
import PgBoss from 'pg-boss';

const DATABASE_URL = process.env['DATABASE_URL'] ??
  'postgresql://jarvis:jarvispass@localhost:5432/jarvis';

async function main() {
  console.log('[worker] Starting Jarvis worker...');

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    retryLimit: 3,
    retryDelay: 60,
    expireInHours: 24,
    archiveCompletedAfterSeconds: 86400,
  });

  boss.on('error', (err) => console.error('[worker] pg-boss error:', err));
  await boss.start();
  console.log('[worker] pg-boss started');

  // Job handlers will be added in Plan 10 (Worker)
  // For now, register a no-op ping job to verify setup
  await boss.work('ping', async (job) => {
    console.log('[worker] ping received:', job.data);
    return { pong: true };
  });

  // Schedule: check freshness daily at 9 AM
  await boss.schedule('check-freshness', '0 9 * * *', {});

  console.log('[worker] Ready. Listening for jobs...');

  process.on('SIGTERM', async () => {
    console.log('[worker] Shutting down...');
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
```

---

## Task 14: Full stack verification

- [ ] **Step 1: Install all dependencies**

```bash
# From project root
pnpm install
```

Expected: All packages installed with no errors.

- [ ] **Step 2: Type-check all packages**

```bash
pnpm type-check
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run DB migrations**

```bash
# Make sure Docker is running
pnpm db:generate
pnpm db:migrate
```

Expected:
```
✓ 1 migration applied
```

- [ ] **Step 4: Start web app**

```bash
pnpm --filter=@jarvis/web dev
```

Open `http://localhost:3000` in browser.

Expected: Redirects to `/login`. Login page shows "SSO로 로그인" button.

- [ ] **Step 5: Verify health endpoint**

```bash
curl http://localhost:3000/api/health
```

Expected:
```json
{ "status": "ok", "timestamp": "...", "service": "jarvis-web" }
```

- [ ] **Step 6: Start worker in separate terminal**

```bash
pnpm --filter=@jarvis/worker dev
```

Expected:
```
[worker] Starting Jarvis worker...
[worker] pg-boss started
[worker] Ready. Listening for jobs...
```

- [ ] **Step 7: Commit foundation**

```bash
git add -A
git commit -m "feat: add Jarvis monorepo foundation

- pnpm workspace + Turborepo
- Docker Compose (PG 16 + pgvector + Redis + MinIO)
- Drizzle ORM schema (32 tables)
- packages: db, shared, auth, search, ai, secret
- Next.js 15 app with AppShell + auth SSO skeleton
- pg-boss worker scaffold

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Monorepo scaffold (Section 8)
- ✅ Docker Compose with all services (Section 7.2)
- ✅ All 32 DB tables in Drizzle schema (Section 11)
- ✅ packages/shared types + Zod validation (Section 12)
- ✅ packages/auth session + RBAC (Section 16)
- ✅ packages/search SearchAdapter interface (Section 13)
- ✅ packages/ai types (Section 20)
- ✅ packages/secret resolver (Section 15)
- ✅ Next.js AppShell + Sidebar + Topbar (Section 10)
- ✅ Auth redirect middleware (Section 16.7)
- ✅ SSO login/callback/logout routes (Section 9)
- ✅ pg-boss worker scaffold (Section 18)
- ⏭️ Feature pages (Plans 02-09)
- ⏭️ Search implementation (Plan 06)
- ⏭️ Worker job handlers (Plan 10)

**Gaps:** None. All foundation dependencies for parallel agent work are defined.

**Type consistency:** All types defined in packages/shared are imported by name across tasks. `JarvisSession` defined in auth/types.ts, used in session.ts and callback route.

---

> **After completing this plan,** parallel agents can start Plans 02-09 simultaneously. Each agent imports from `@jarvis/db`, `@jarvis/shared`, `@jarvis/auth`, `@jarvis/search` for typed interfaces.
