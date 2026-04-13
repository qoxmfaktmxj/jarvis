# Graphify Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Graphify(코드 knowledge graph 빌드 도구)를 Jarvis에 통합하여 텍스트 RAG + 구조 탐색을 동시에 지원하는 시스템을 구축한다.

**Architecture:** Graphify를 worker의 Python subprocess로 실행하고 산출물(GRAPH_REPORT.md, wiki, graph.json)을 기존 knowledge pipeline에 태운다. Phase 2에서 graph.html iframe 시각화, Phase 3에서 graph_node/edge DB materialization + Ask AI graph context 주입.

**Tech Stack:** Node.js (worker), Python 3.10+ (Graphify subprocess), PostgreSQL (graph tables, CTE traversal), MinIO (graph.json/html 저장), pg-boss (job queue), Anthropic Claude Haiku 4.5 (Graphify LLM — 비용 최적화), @sigma/react (Phase 2 후기 시각화)

**LLM Model:** `claude-haiku-4-5-20251001` (비용 절감 목적, 성능 부족 시 `claude-sonnet-4-5-20250514`로 전환)

**API Key:** `C:\Users\kms\Desktop\dev\jarvis_claude_key.txt` (평문, 레포 외부) — `.env`로 로드, git 커밋 금지

---

## File Structure

### New Files

| Path | Responsibility |
|------|---------------|
| `apps/worker/src/jobs/graphify-build.ts` | graphify-build pg-boss job handler (subprocess 실행, 결과 수집) |
| `apps/worker/src/helpers/import-knowledge.ts` | knowledge_page + version 트랜잭션 insert + compile/embed enqueue |
| `apps/worker/src/helpers/unarchive.ts` | ZIP/tar 압축 해제 유틸 |
| `apps/worker/src/helpers/materialize-graph.ts` | graph.json → graph_node/edge/community bulk insert (Phase 3) |
| `packages/db/schema/graph.ts` | graph_snapshot, graph_node, graph_edge, graph_community 테이블 |
| `packages/ai/graph-context.ts` | retrieveRelevantGraphContext() — Ask AI용 graph retrieval (Phase 3) |
| `apps/web/app/api/graphify/build/route.ts` | POST /api/graphify/build — 수동 빌드 트리거 |
| `apps/web/app/api/graphify/snapshots/route.ts` | GET /api/graphify/snapshots — snapshot 목록 |
| `apps/web/app/api/graphify/snapshots/[id]/route.ts` | GET /api/graphify/snapshots/:id — snapshot 상세 |
| `apps/web/app/api/graphify/snapshots/[id]/graph/route.ts` | GET — MinIO presigned URL redirect |
| `apps/worker/src/lib/boss.ts` | PgBoss 싱글톤 인스턴스 (circular import 방지) |
| `apps/web/app/(app)/architecture/page.tsx` | Architecture Viewer 페이지 (Phase 2) |
| `apps/web/app/(app)/architecture/components/GraphViewer.tsx` | graph.html iframe 뷰어 (Phase 2) |
| `apps/web/app/(app)/architecture/components/SnapshotSelector.tsx` | snapshot 선택 드롭다운 (Phase 2) |
| `apps/web/app/(app)/architecture/components/GodNodesCard.tsx` | god nodes 카드 (Phase 2) |
| `apps/web/app/(app)/architecture/components/SuggestedQuestions.tsx` | 질문 제안 → Ask AI 연동 (Phase 2) |

### Modified Files

| Path | Change |
|------|--------|
| `apps/worker/src/jobs/compile.ts` | compile 완료 후 embed job enqueue 추가 (Phase 0) |
| `apps/worker/src/index.ts` | boss.ts import + graphify-build job 등록 (Phase 1A) |
| `apps/web/e2e/helpers/auth.ts` | ROLE_PERMISSIONS 연동으로 permissions 수정 (Phase 0) |
| `apps/web/app/api/upload/route.ts` | ZIP 업로드 시 graphify-build 조건부 enqueue (Phase 1B) |
| `packages/db/schema/index.ts` | graph 테이블 export 추가 |
| `packages/ai/ask.ts` | graph context 병렬 retrieval + XML 주입 (Phase 3) |
| `packages/search/types.ts` | ResourceType에 'graph' 추가 (Phase 3) |
| `.gitignore` | API key 파일 패턴 추가 |
| `docker/Dockerfile.worker` | Python 3.10 + graphifyy 레이어 추가 (Phase 1A) |
| `.env.example` | GRAPHIFY_ 관련 env vars 추가 |

---

## Phase 0: Foundation Fixes (3일)

> 기존 파이프라인 버그를 먼저 수정한다. compile→embed 체인이 끊겨 있으면 Graphify 결과를 import해도 검색에 반영되지 않는다.

---

### Task 0.1: compile handler에 embed job enqueue 추가

**Files:**
- Modify: `apps/worker/src/jobs/compile.ts:28-76`

현재 compile handler는 summary 생성 후 종료한다. embed job을 enqueue하지 않아 knowledge_page가 compile까지만 가고 벡터 임베딩이 생성되지 않는다.

- [ ] **Step 1: compile.ts에 PgBoss import 및 embed enqueue 추가**

```typescript
// apps/worker/src/jobs/compile.ts — 전체 파일 교체

import type PgBoss from 'pg-boss';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { eq, desc } from 'drizzle-orm';

export interface CompileJobData {
  pageId: string;
  skipEmbed?: boolean; // 테스트 시 embed 건너뛰기 용
}

/**
 * Strips common Markdown/MDX syntax to produce a plain-text summary.
 */
function stripMarkdown(mdx: string): string {
  return mdx
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code / code blocks
    .replace(/^```[\s\S]*?```/gm, '') // fenced code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/^[-*+]\s+/gm, '') // list items
    .replace(/^\d+\.\s+/gm, '') // ordered list items
    .replace(/\n{2,}/g, '\n\n') // collapse excess blank lines
    .trim();
}

export async function compileHandler(
  jobs: PgBoss.Job<CompileJobData>[],
): Promise<void> {
  for (const job of jobs) {
    await processCompile(job);
  }
}

async function processCompile(
  job: PgBoss.Job<CompileJobData>,
): Promise<void> {
  const { pageId, skipEmbed } = job.data;
  console.log(`[compile] Starting job for pageId=${pageId}`);

  // Fetch knowledge_page
  const [page] = await db
    .select()
    .from(knowledgePage)
    .where(eq(knowledgePage.id, pageId))
    .limit(1);

  if (!page) {
    throw new Error(`knowledge_page not found: ${pageId}`);
  }

  // Fetch latest version for summary generation
  const [latestVersion] = await db
    .select()
    .from(knowledgePageVersion)
    .where(eq(knowledgePageVersion.pageId, pageId))
    .orderBy(desc(knowledgePageVersion.versionNumber))
    .limit(1);

  const summary = latestVersion?.mdxContent
    ? stripMarkdown(latestVersion.mdxContent).slice(0, 500)
    : '';

  // Force search_vector refresh — the tsvector update trigger fires on updated_at change.
  await db
    .update(knowledgePage)
    .set({
      summary,
      updatedAt: new Date(),
    })
    .where(eq(knowledgePage.id, pageId));

  console.log(`[compile] Done pageId=${pageId} summary_length=${summary.length}`);

  // Chain: enqueue embed job so the page becomes vector-searchable
  if (!skipEmbed && latestVersion?.mdxContent) {
    const { boss } = await import('../lib/boss.js');
    await boss.send('embed', { pageId });
    console.log(`[compile] Enqueued embed job for pageId=${pageId}`);
  }
}
```

- [ ] **Step 2: PgBoss 싱글톤을 별도 모듈로 추출 (circular import 방지)**

`index.ts`에서 boss를 export하면 `index.ts → compile.ts → import-knowledge.ts → index.ts` circular dependency가 발생한다. 별도 모듈로 분리:

```typescript
// apps/worker/src/lib/boss.ts (신규)

import PgBoss from 'pg-boss';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

export const boss = new PgBoss({
  connectionString: DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30,
});

boss.on('error', (error) => {
  console.error('[pg-boss] error', error);
});
```

- [ ] **Step 3: index.ts에서 boss.ts import 사용으로 변경**

```typescript
// apps/worker/src/index.ts — 전체 교체

import 'dotenv/config';
import { boss } from './lib/boss.js';
import { ingestHandler } from './jobs/ingest.js';
import { embedHandler } from './jobs/embed.js';
import { compileHandler } from './jobs/compile.js';
import { staleCheckHandler } from './jobs/stale-check.js';
import { aggregatePopularHandler } from './jobs/aggregate-popular.js';
import { cleanupHandler } from './jobs/cleanup.js';
import { ensureBucket } from './lib/minio-client.js';

async function main() {
  await boss.start();
  console.log('[worker] pg-boss started');

  await ensureBucket();

  await boss.work('ingest', { batchSize: 5 }, ingestHandler);
  await boss.work('embed', { batchSize: 3 }, embedHandler);
  await boss.work('compile', { batchSize: 3 }, compileHandler);

  await boss.schedule('check-freshness', '0 9 * * *', {});
  await boss.work('check-freshness', staleCheckHandler);

  await boss.schedule('aggregate-popular', '0 0 * * 0', {});
  await boss.work('aggregate-popular', aggregatePopularHandler);

  await boss.schedule('cleanup', '0 0 1 * *', {});
  await boss.work('cleanup', cleanupHandler);

  console.log('[worker] All job handlers registered. Worker is running.');

  process.on('SIGTERM', async () => {
    console.log('[worker] SIGTERM received, stopping...');
    await boss.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[worker] SIGINT received, stopping...');
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: compile.ts에서 boss.ts import 사용**

```typescript
// apps/worker/src/jobs/compile.ts — embed enqueue 부분:
// processCompile 함수의 마지막에 추가:

  // Chain: enqueue embed job so the page becomes vector-searchable
  if (!skipEmbed && latestVersion?.mdxContent) {
    const { boss } = await import('../lib/boss.js');
    await boss.send('embed', { pageId });
    console.log(`[compile] Enqueued embed job for pageId=${pageId}`);
  }
```

- [ ] **Step 5: 동작 확인**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 타입 에러 없이 통과

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/lib/boss.ts apps/worker/src/jobs/compile.ts apps/worker/src/index.ts
git commit -m "fix: chain compile→embed — extract boss singleton, enqueue embed after compile"
```

---

### Task 0.2: E2E 테스트 헬퍼 RBAC 정합성 수정

**Files:**
- Modify: `apps/web/e2e/helpers/auth.ts:17-51`

현재 `loginAsTestUser()`는 `roles: ['VIEWER']`이면서 `permissions: []`로 세션을 생성한다. 실제 `ROLE_PERMISSIONS`에서 VIEWER는 `knowledge:read, project:read, system:read, attendance:read` 4개 권한을 가진다. 테스트 세션과 실제 RBAC 모델이 불일치하면 권한 관련 E2E 테스트가 현실을 반영하지 못한다.

- [ ] **Step 1: auth.ts에 ROLE_PERMISSIONS import 및 permissions 연동**

```typescript
// apps/web/e2e/helpers/auth.ts — 전체 파일 교체

import { type Page } from '@playwright/test';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

// Match actual Redis URL from env (port 6380)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

// Cookie name from apps/web/middleware.ts: request.cookies.get("sessionId")
const SESSION_COOKIE = 'sessionId';

// Redis key prefix from packages/auth/session.ts: "jarvis:session:"
const SESSION_PREFIX = 'jarvis:session:';

// Session TTL matching packages/auth/session.ts (8 hours)
const SESSION_TTL = 60 * 60 * 8;

interface LoginOptions {
  role: string;
  userId?: string;
  employeeId?: string;
  name?: string;
  email?: string;
}

async function loginWithRole(page: Page, opts: LoginOptions): Promise<void> {
  const sessionId = randomUUID();
  const redis = new Redis(REDIS_URL);

  const now = Date.now();
  const permissions = ROLE_PERMISSIONS[opts.role] ?? [];

  const sessionData = JSON.stringify({
    id: sessionId,
    userId: opts.userId ?? 'test-user-id-001',
    workspaceId: 'test-workspace-id-001',
    employeeId: opts.employeeId ?? 'EMP001',
    name: opts.name ?? '테스트 사용자',
    email: opts.email ?? 'test@jarvis.internal',
    roles: [opts.role],
    permissions: [...permissions],
    orgId: undefined,
    ssoSubject: opts.userId ?? 'test-user-id-001',
    createdAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  });

  await redis.setex(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL, sessionData);
  await redis.quit();

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionId,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function loginAsTestUser(page: Page): Promise<void> {
  await loginWithRole(page, { role: 'VIEWER' });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginWithRole(page, {
    role: 'ADMIN',
    userId: 'test-admin-id-001',
    employeeId: 'ADM001',
    name: '관리자',
    email: 'admin@jarvis.internal',
  });
}

export async function loginAsDeveloper(page: Page): Promise<void> {
  await loginWithRole(page, {
    role: 'DEVELOPER',
    userId: 'test-dev-id-001',
    employeeId: 'DEV001',
    name: '개발자',
    email: 'dev@jarvis.internal',
  });
}
```

- [ ] **Step 2: 타입 체크 확인**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/helpers/auth.ts
git commit -m "fix: E2E test helper — derive permissions from ROLE_PERMISSIONS instead of hardcoded empty array"
```

---

### Task 0.3: API Key 및 Graphify 환경변수 관리

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`

API 키는 `C:\Users\kms\Desktop\dev\jarvis_claude_key.txt`에 평문으로 저장되어 있다. 이 파일은 레포 외부에 있지만, 실수로 복사되거나 키가 코드에 하드코딩되는 것을 방지해야 한다.

- [ ] **Step 1: .gitignore에 API key 관련 패턴 추가**

`.gitignore` 파일 끝에 다음을 추가:

```gitignore
# API Keys & Secrets (never commit)
*_key.txt
*_api_key*
*.key
secrets/
```

- [ ] **Step 2: .env.example에 Graphify 관련 환경변수 추가**

`.env.example` 파일에 다음 섹션 추가:

```bash
# Graphify (code graph builder)
GRAPHIFY_API_KEY=sk-ant-...             # Anthropic API key for Graphify's LLM extraction
GRAPHIFY_MODEL=claude-haiku-4-5-20251001  # LLM model (haiku for cost savings, sonnet for quality)
GRAPHIFY_BIN=graphify                     # Path to graphify binary (or /opt/graphify-venv/bin/graphify in Docker)
GRAPHIFY_TIMEOUT_MS=600000                # 10 minutes max per build
GRAPHIFY_MAX_FILE_COUNT=5000              # Skip repos with more files
GRAPHIFY_MAX_ARCHIVE_MB=200              # Skip archives larger than 200MB
```

- [ ] **Step 3: .env 파일에 실제 키 설정 (로컬 개발용)**

로컬 `.env` 파일에 키를 추가한다. `.env`는 이미 `.gitignore`에 포함되어 있으므로 커밋되지 않는다:

```bash
# 터미널에서 실행 (Windows PowerShell)
$key = Get-Content "C:\Users\kms\Desktop\dev\jarvis_claude_key.txt" -Raw
Add-Content .env "GRAPHIFY_API_KEY=$($key.Trim())"
Add-Content .env "GRAPHIFY_MODEL=claude-haiku-4-5-20251001"
```

또는 수동으로 `.env` 파일에 키를 복사:

```bash
# .env에 추가
GRAPHIFY_API_KEY=<jarvis_claude_key.txt 내용 붙여넣기>
GRAPHIFY_MODEL=claude-haiku-4-5-20251001
```

> **주의:** `GRAPHIFY_API_KEY`는 Graphify Python subprocess에 전달되는 Anthropic API 키이다. 기존 `ANTHROPIC_API_KEY`(Ask AI용 Sonnet)와는 같은 키일 수 있지만, 용도와 모델이 다르므로 별도 환경변수로 관리한다. 같은 키를 사용하는 경우 `GRAPHIFY_API_KEY=$ANTHROPIC_API_KEY`로 설정해도 된다.

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add Graphify env vars to .env.example, add API key patterns to .gitignore"
```

---

### Task 0.4: ZIP ingest 처리 개선

**Files:**
- Modify: `apps/worker/src/jobs/ingest.ts:40-42`

현재 ZIP 파일은 `[Binary file: application/zip]` placeholder로 처리된다. Graphify가 ZIP을 별도 파이프라인으로 처리하므로, ingest에서는 ZIP에 대한 안내 메시지만 남기고 조용히 통과시킨다.

- [ ] **Step 1: extractText()에서 ZIP 분기를 개선**

`apps/worker/src/jobs/ingest.ts`의 `extractText` 함수에서 ZIP 처리를 개선:

```typescript
// apps/worker/src/jobs/ingest.ts — extractText 함수의 ZIP 처리 부분 수정
// 기존 40-42줄을 다음으로 교체:

  // Archive types: text extraction is not meaningful.
  // Graphify pipeline handles structural analysis separately.
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-tar' ||
    mimeType === 'application/gzip' ||
    mimeType === 'application/x-7z-compressed'
  ) {
    return `[Archive: ${mimeType}] This file contains a code/document archive. Use the Graphify analysis pipeline for structural analysis.`;
  }

  // Other binary types: return placeholder
  return `[Binary file: ${mimeType}]`;
```

- [ ] **Step 2: 타입 체크 확인**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/jobs/ingest.ts
git commit -m "fix: improve ZIP ingest message — indicate Graphify pipeline handles archives"
```

---

## Phase 1A: Graphify Manual Build MVP (1주)

> Graphify를 수동으로 트리거하고, GRAPH_REPORT.md 1건을 knowledge pipeline에 태워 Ask AI/Search에서 구조 질문에 답할 수 있게 만든다.

---

### Task 1.1: graph_snapshot 스키마 정의

**Files:**
- Create: `packages/db/schema/graph.ts`
- Modify: `packages/db/schema/index.ts`

Phase 1에서는 graph_snapshot만 생성한다. graph_node/edge/community는 Phase 3에서 추가한다.

- [ ] **Step 1: graph.ts 스키마 파일 생성**

```typescript
// packages/db/schema/graph.ts

import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';
import { workspace } from './tenant.js';
import { rawSource } from './file.js';
import { user } from './user.js';

export const graphSnapshot = pgTable('graph_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id),
  rawSourceId: uuid('raw_source_id').references(() => rawSource.id),
  title: varchar('title', { length: 500 }).notNull(),

  // MinIO storage paths
  graphJsonPath: varchar('graph_json_path', { length: 1000 }),
  graphHtmlPath: varchar('graph_html_path', { length: 1000 }),

  // Build statistics
  nodeCount: integer('node_count'),
  edgeCount: integer('edge_count'),
  communityCount: integer('community_count'),
  fileCount: integer('file_count'),

  // Build metadata
  buildMode: varchar('build_mode', { length: 20 }).default('standard').notNull(),
  buildStatus: varchar('build_status', { length: 20 }).default('pending').notNull(),
  buildDurationMs: integer('build_duration_ms'),
  buildError: varchar('build_error', { length: 2000 }),

  // Analysis summary from Graphify analyze.py
  analysisMetadata: jsonb('analysis_metadata')
    .$type<{
      godNodes?: string[];
      communityLabels?: string[];
      suggestedQuestions?: string[];
      tokenReduction?: number;
    }>()
    .default({})
    .notNull(),

  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('idx_graph_snapshot_workspace').on(table.workspaceId),
  statusIdx: index('idx_graph_snapshot_status').on(table.buildStatus),
}));
```

- [ ] **Step 2: schema/index.ts에 graph export 추가**

```typescript
// packages/db/schema/index.ts — 마지막 줄에 추가:
export * from "./graph.js";
```

- [ ] **Step 3: Drizzle migration 생성**

Run: `cd packages/db && npx drizzle-kit generate`
Expected: migration SQL 파일 생성 (graph_snapshot 테이블 + 인덱스)

- [ ] **Step 4: Migration 적용**

Run: `cd packages/db && npx drizzle-kit migrate`
Expected: graph_snapshot 테이블이 DB에 생성

- [ ] **Step 5: Commit**

```bash
git add packages/db/schema/graph.ts packages/db/schema/index.ts
git commit -m "feat(graphify): add graph_snapshot table schema"
```

---

### Task 1.2: Python 환경 설정 (Docker)

**Files:**
- Modify: `docker/Dockerfile.worker`

worker Docker 이미지에 Python 3.10+ 과 graphifyy 패키지를 설치한다.

- [ ] **Step 1: Dockerfile.worker runner stage에 Python 레이어 추가**

`docker/Dockerfile.worker`의 runner stage (43행 이후)에 다음을 추가:

```dockerfile
# ============================================================
# Stage 3: runner — tsx runs TypeScript source directly
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Python 3.10+ for Graphify subprocess
RUN apk add --no-cache python3 py3-pip python3-dev gcc musl-dev \
 && python3 -m venv /opt/graphify-venv \
 && /opt/graphify-venv/bin/pip install --no-cache-dir graphifyy \
 && apk del python3-dev gcc musl-dev

ENV GRAPHIFY_BIN=/opt/graphify-venv/bin/graphify

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 worker
```

> **참고:** `apk del python3-dev gcc musl-dev`로 빌드 전용 패키지를 제거하여 이미지 크기를 최소화한다. graphifyy의 C extension이 필요하면 `gcc musl-dev`를 유지해야 할 수 있다.

- [ ] **Step 2: Docker 빌드 테스트**

Run: `cd docker && docker build -f Dockerfile.worker -t jarvis-worker-test ..`
Expected: 빌드 성공, graphify 바이너리 존재 확인

Run: `docker run --rm jarvis-worker-test /opt/graphify-venv/bin/graphify --version`
Expected: graphify 버전 출력

- [ ] **Step 3: Commit**

```bash
git add docker/Dockerfile.worker
git commit -m "feat(graphify): add Python 3.10 + graphifyy to worker Docker image"
```

---

### Task 1.3: 압축 해제 유틸리티

**Files:**
- Create: `apps/worker/src/helpers/unarchive.ts`

ZIP/tar/tar.gz 파일을 임시 디렉토리에 압축 해제하는 유틸리티.

- [ ] **Step 1: unarchive.ts 생성**

```typescript
// apps/worker/src/helpers/unarchive.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Extracts an archive file into the target directory.
 * Supports: .zip, .tar, .tar.gz, .tgz
 * Returns the list of extracted file paths (relative to targetDir).
 */
export async function unarchive(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', targetDir], {
      timeout: 120_000, // 2 min max for extraction
    });
  } else if (
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz')
  ) {
    await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDir], {
      timeout: 120_000,
    });
  } else if (lower.endsWith('.tar')) {
    await execFileAsync('tar', ['-xf', archivePath, '-C', targetDir], {
      timeout: 120_000,
    });
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }
}

/**
 * Counts files in a directory (non-recursive count of regular files).
 */
export async function countFiles(dir: string): Promise<number> {
  const { stdout } = await execFileAsync('find', [dir, '-type', 'f'], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim().split('\n').filter(Boolean).length;
}

/**
 * Returns directory size in bytes.
 */
export async function dirSizeBytes(dir: string): Promise<number> {
  const info = await stat(dir);
  // For a rough estimate, use du
  const { stdout } = await execFileAsync('du', ['-sb', dir], {
    timeout: 30_000,
  });
  const bytes = parseInt(stdout.split('\t')[0] ?? '0', 10);
  return bytes;
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/helpers/unarchive.ts
git commit -m "feat(graphify): add unarchive utility for ZIP/tar extraction"
```

---

### Task 1.4: Knowledge import 헬퍼

**Files:**
- Create: `apps/worker/src/helpers/import-knowledge.ts`

Graphify 산출물(GRAPH_REPORT.md, wiki 파일)을 knowledge_page + knowledge_page_version으로 insert하고 compile job을 enqueue한다. compile→embed 체인(Task 0.1)에 의해 벡터 임베딩까지 자동으로 진행된다.

- [ ] **Step 1: import-knowledge.ts 생성**

```typescript
// apps/worker/src/helpers/import-knowledge.ts

import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { boss } from '../lib/boss.js';

export interface ImportKnowledgeParams {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;       // e.g. 'analysis', 'wiki'
  sensitivity: string;    // e.g. 'INTERNAL'
  createdBy: string;      // userId
}

/**
 * Creates a knowledge_page + knowledge_page_version in a single transaction,
 * then enqueues a compile job. The compile handler will chain to embed.
 *
 * Returns the created pageId.
 */
export async function importAsKnowledgePage(
  params: ImportKnowledgeParams,
): Promise<string> {
  const pageId = randomUUID();
  const versionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: params.slug,
      sensitivity: params.sensitivity,
      publishStatus: 'published',
      createdBy: params.createdBy,
    });

    await tx.insert(knowledgePageVersion).values({
      id: versionId,
      pageId,
      versionNumber: 1,
      title: params.title, // notNull — 반드시 포함
      mdxContent: params.mdxContent,
      changeNote: 'Auto-imported from Graphify analysis',
    });
  });

  // Enqueue compile → (auto) embed chain
  await boss.send('compile', { pageId });
  console.log(`[import-knowledge] Created pageId=${pageId} title="${params.title}" → compile enqueued`);

  return pageId;
}

/**
 * Generates a URL-safe slug from a title.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/helpers/import-knowledge.ts
git commit -m "feat(graphify): add importAsKnowledgePage helper with compile→embed chain"
```

---

### Task 1.5: graphify-build job handler

**Files:**
- Create: `apps/worker/src/jobs/graphify-build.ts`
- Modify: `apps/worker/src/index.ts`

핵심 handler: MinIO에서 archive 다운로드 → 임시 디렉토리 압축 해제 → Python subprocess로 Graphify 실행 → 결과물 수집 → knowledge import + MinIO 업로드 → graph_snapshot 메타데이터 저장

> **설계 결정 — `--no-viz` 미사용:** 원본 계획서(docs/plan/graphify-integration.md)는 `--no-viz --wiki`를 사용하면서 동시에 graph.html을 수집한다고 적었는데, 이는 자기모순이다. `--no-viz`는 graph.html 생성을 건너뛴다. Phase 2의 Architecture Viewer가 graph.html iframe을 필요로 하므로, **이 구현에서는 `--no-viz`를 사용하지 않는다.** `--wiki`만 전달하여 graph.html + wiki 모두 생성한다. 빌드 시간이 길어질 경우 `--no-viz`를 옵션으로 추가할 수 있다.

- [ ] **Step 1: graphify-build.ts 생성**

```typescript
// apps/worker/src/jobs/graphify-build.ts

import type PgBoss from 'pg-boss';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq } from 'drizzle-orm';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { unarchive, countFiles } from '../helpers/unarchive.js';
import { importAsKnowledgePage, slugify } from '../helpers/import-knowledge.js';

const execFileAsync = promisify(execFile);

const GRAPHIFY_BIN = process.env['GRAPHIFY_BIN'] || 'graphify';
const GRAPHIFY_TIMEOUT_MS = parseInt(process.env['GRAPHIFY_TIMEOUT_MS'] || '600000', 10);
const GRAPHIFY_MODEL = process.env['GRAPHIFY_MODEL'] || 'claude-haiku-4-5-20251001';
const GRAPHIFY_API_KEY = process.env['GRAPHIFY_API_KEY'] || process.env['ANTHROPIC_API_KEY'];
const MAX_FILE_COUNT = parseInt(process.env['GRAPHIFY_MAX_FILE_COUNT'] || '5000', 10);
const MAX_ARCHIVE_MB = parseInt(process.env['GRAPHIFY_MAX_ARCHIVE_MB'] || '200', 10);

export interface GraphifyBuildPayload {
  rawSourceId: string;
  workspaceId: string;
  requestedBy: string;
  mode?: 'standard' | 'deep';
}

export async function graphifyBuildHandler(
  jobs: PgBoss.Job<GraphifyBuildPayload>[],
): Promise<void> {
  // batchSize: 1 — one at a time (CPU/memory intensive)
  for (const job of jobs) {
    await processGraphifyBuild(job);
  }
}

async function processGraphifyBuild(
  job: PgBoss.Job<GraphifyBuildPayload>,
): Promise<void> {
  const { rawSourceId, workspaceId, requestedBy, mode } = job.data;
  const snapshotId = randomUUID();
  const startTime = Date.now();

  console.log(`[graphify-build] Starting snapshotId=${snapshotId} rawSourceId=${rawSourceId}`);

  // Create snapshot record with 'building' status
  await db.insert(graphSnapshot).values({
    id: snapshotId,
    workspaceId,
    rawSourceId,
    title: `Building...`,
    buildMode: mode ?? 'standard',
    buildStatus: 'building',
    createdBy: requestedBy,
  });

  let tempDir: string | undefined;

  try {
    // 1. Fetch raw_source
    const [source] = await db
      .select()
      .from(rawSource)
      .where(eq(rawSource.id, rawSourceId))
      .limit(1);

    if (!source?.storagePath) {
      throw new Error(`raw_source ${rawSourceId} not found or no storagePath`);
    }

    // 2. Size guard
    const sizeMB = (source.sizeBytes ?? 0) / (1024 * 1024);
    if (sizeMB > MAX_ARCHIVE_MB) {
      throw new Error(`Archive too large: ${sizeMB.toFixed(1)}MB exceeds ${MAX_ARCHIVE_MB}MB limit`);
    }

    // 3. Create temp dir + download + extract
    tempDir = await mkdtemp(join(tmpdir(), 'graphify-'));
    const archivePath = join(tempDir, source.originalFilename || 'archive.zip');

    await minioClient.fGetObject(BUCKET, source.storagePath, archivePath);
    await unarchive(archivePath, tempDir);

    // 4. File count guard
    const fileCount = await countFiles(tempDir);
    if (fileCount > MAX_FILE_COUNT) {
      throw new Error(`Too many files: ${fileCount} exceeds ${MAX_FILE_COUNT} limit`);
    }

    // 5. Generate .graphifyignore
    const ignoreContent = [
      'node_modules/', '.git/', 'dist/', 'build/', 'vendor/',
      '__pycache__/', '.venv/', '.tox/', '.mypy_cache/',
      '*.min.js', '*.min.css', '*.map',
      '*.pyc', '*.pyo', '*.so', '*.dylib',
    ].join('\n');
    await writeFile(join(tempDir, '.graphifyignore'), ignoreContent);

    // 6. Run Graphify subprocess
    const args = [tempDir, '--wiki'];
    if (mode === 'deep') args.push('--mode', 'deep');

    const { stdout, stderr } = await execFileAsync(GRAPHIFY_BIN, args, {
      timeout: GRAPHIFY_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: GRAPHIFY_API_KEY,
        GRAPHIFY_MODEL: GRAPHIFY_MODEL,
      },
    });

    if (stderr) {
      console.warn(`[graphify-build] stderr: ${stderr.slice(0, 500)}`);
    }

    // 7. Collect outputs
    const outDir = join(tempDir, 'graphify-out');

    // 7a. graph.json → MinIO
    const graphJsonKey = `graphify/${workspaceId}/${snapshotId}/graph.json`;
    try {
      await minioClient.fPutObject(BUCKET, graphJsonKey, join(outDir, 'graph.json'));
    } catch {
      console.warn('[graphify-build] graph.json not found — skipping MinIO upload');
    }

    // 7b. graph.html → MinIO (if generated — depends on whether --no-viz was used)
    let graphHtmlKey: string | undefined;
    try {
      graphHtmlKey = `graphify/${workspaceId}/${snapshotId}/graph.html`;
      await minioClient.fPutObject(BUCKET, graphHtmlKey, join(outDir, 'graph.html'));
    } catch {
      graphHtmlKey = undefined;
      console.log('[graphify-build] graph.html not found — skipping');
    }

    // 8. GRAPH_REPORT.md → knowledge_page
    let reportTitle = `[Graph] Architecture Report`;
    try {
      const reportContent = await readFile(join(outDir, 'GRAPH_REPORT.md'), 'utf-8');
      reportTitle = `[Graph] Architecture Report — ${source.originalFilename ?? 'archive'}`;
      await importAsKnowledgePage({
        workspaceId,
        title: reportTitle,
        slug: `graph-report-${snapshotId.slice(0, 8)}`,
        mdxContent: reportContent,
        pageType: 'analysis',
        sensitivity: 'INTERNAL',
        createdBy: requestedBy,
      });
    } catch {
      console.warn('[graphify-build] GRAPH_REPORT.md not found — skipping knowledge import');
    }

    // 9. Parse graph.json for stats
    let nodeCount = 0;
    let edgeCount = 0;
    let communityCount = 0;
    let analysisMetadata: Record<string, unknown> = {};

    try {
      const graphJsonRaw = await readFile(join(outDir, 'graph.json'), 'utf-8');
      const graphJson = JSON.parse(graphJsonRaw);
      nodeCount = graphJson.nodes?.length ?? 0;
      edgeCount = graphJson.links?.length ?? 0;
      const communities = new Set(
        graphJson.nodes?.map((n: { community?: number }) => n.community).filter((c: unknown) => c != null),
      );
      communityCount = communities.size;

      // Extract god nodes (top 5 by edge count)
      const edgeCounts = new Map<string, number>();
      for (const link of graphJson.links ?? []) {
        edgeCounts.set(link.source, (edgeCounts.get(link.source) ?? 0) + 1);
        edgeCounts.set(link.target, (edgeCounts.get(link.target) ?? 0) + 1);
      }
      const godNodes = [...edgeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => {
          const node = graphJson.nodes?.find((n: { id: string }) => n.id === id);
          return node?.label ?? id;
        });

      analysisMetadata = {
        godNodes,
        communityLabels: [...communities].map(String),
        suggestedQuestions: graphJson.graph?.suggested_questions ?? [],
      };
    } catch {
      console.warn('[graphify-build] graph.json parsing failed — continuing with empty stats');
    }

    // 10. Update snapshot to completed
    const durationMs = Date.now() - startTime;
    await db
      .update(graphSnapshot)
      .set({
        title: reportTitle,
        graphJsonPath: graphJsonKey,
        graphHtmlPath: graphHtmlKey,
        nodeCount,
        edgeCount,
        communityCount,
        fileCount,
        buildStatus: 'completed',
        buildDurationMs: durationMs,
        analysisMetadata,
        updatedAt: new Date(),
      })
      .where(eq(graphSnapshot.id, snapshotId));

    console.log(
      `[graphify-build] Completed snapshotId=${snapshotId} nodes=${nodeCount} edges=${edgeCount} duration=${durationMs}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[graphify-build] Failed snapshotId=${snapshotId}: ${message}`);

    await db
      .update(graphSnapshot)
      .set({
        buildStatus: 'failed',
        buildError: message.slice(0, 2000),
        buildDurationMs: Date.now() - startTime,
        updatedAt: new Date(),
      })
      .where(eq(graphSnapshot.id, snapshotId));

    throw err; // re-throw for pg-boss retry
  } finally {
    // 11. Cleanup temp dir
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: worker index.ts에 graphify-build job 등록**

`apps/worker/src/index.ts`의 on-demand job 등록 블록(31-34행 이후)에 추가:

```typescript
// apps/worker/src/index.ts — import 추가 (파일 상단)
import { graphifyBuildHandler } from './jobs/graphify-build.js';

// on-demand job 등록 블록에 추가 (compile 다음줄):
  await boss.work('graphify-build', { batchSize: 1 }, graphifyBuildHandler);
```

- [ ] **Step 3: 타입 체크**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/jobs/graphify-build.ts apps/worker/src/index.ts
git commit -m "feat(graphify): add graphify-build job handler with subprocess execution and knowledge import"
```

---

### Task 1.6: POST /api/graphify/build 엔드포인트

**Files:**
- Create: `apps/web/app/api/graphify/build/route.ts`

수동으로 Graphify 빌드를 트리거하는 API. 이미 업로드된 raw_source에 대해 graphify-build job을 enqueue한다.

- [ ] **Step 1: route.ts 생성**

```typescript
// apps/web/app/api/graphify/build/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/server/api-auth';
import PgBoss from 'pg-boss';

const buildSchema = z.object({
  rawSourceId: z.string().uuid(),
  mode: z.enum(['standard', 'deep']).optional(),
});

let _boss: PgBoss | null = null;
let _bossStarted = false;

async function getBoss(): Promise<PgBoss> {
  if (!_boss) {
    _boss = new PgBoss({ connectionString: process.env['DATABASE_URL']! });
  }
  if (!_bossStarted) {
    await _boss.start();
    _bossStarted = true;
  }
  return _boss;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Require knowledge:create permission to trigger Graphify builds
  const auth = await requireApiSession(req, 'knowledge:create');
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await req.json();
  const parsed = buildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rawSourceId, mode } = parsed.data;

  const boss = await getBoss();
  const jobId = await boss.send('graphify-build', {
    rawSourceId,
    workspaceId: session.workspaceId,
    requestedBy: session.userId,
    mode: mode ?? 'standard',
  });

  return NextResponse.json({ jobId, message: 'Graphify build enqueued' }, { status: 202 });
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/graphify/build/route.ts
git commit -m "feat(graphify): add POST /api/graphify/build endpoint for manual build trigger"
```

---

### Task 1.7: Phase 1A 통합 확인

수동 검증 단계. Docker 환경에서 전체 파이프라인을 테스트한다.

- [ ] **Step 1: Docker 빌드 및 실행**

```bash
cd docker
docker compose -f docker-compose.dev.yml up --build -d
```

- [ ] **Step 2: ZIP 파일 업로드 + 수동 빌드 트리거**

```bash
# 1. presign 요청
curl -X POST http://localhost:3010/api/upload/presign \
  -H "Cookie: sessionId=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test-repo.zip","mimeType":"application/zip","sizeBytes":1024000}'

# 2. MinIO에 파일 업로드 (presignedUrl 사용)
curl -X PUT "<presignedUrl>" --upload-file test-repo.zip

# 3. upload 등록
curl -X POST http://localhost:3010/api/upload \
  -H "Cookie: sessionId=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"objectKey":"<objectKey>","filename":"test-repo.zip","mimeType":"application/zip","sizeBytes":1024000}'

# 4. Graphify 빌드 트리거
curl -X POST http://localhost:3010/api/graphify/build \
  -H "Cookie: sessionId=<admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"rawSourceId":"<rawSourceId>"}'
```

Expected: worker 로그에 `[graphify-build] Completed` 출력, DB에 graph_snapshot 레코드 생성, knowledge_page에 `[Graph] Architecture Report` 제목의 페이지 생성

- [ ] **Step 3: 검색에서 graph report 확인**

```bash
curl "http://localhost:3010/api/search?q=architecture+graph" \
  -H "Cookie: sessionId=<admin-session>"
```

Expected: `[Graph] Architecture Report` 페이지가 검색 결과에 포함

- [ ] **Step 4: Commit (통합 확인 완료 후)**

```bash
git add -A
git commit -m "feat(graphify): Phase 1A complete — manual build + GRAPH_REPORT knowledge import"
```

---

## Phase 1B: Wiki Import + Auto-trigger (1주)

> wiki 다건 import, ZIP 업로드 시 자동 graphify-build enqueue, 빌드 상태 조회 API

---

### Task 1.8: Wiki 다건 import

**Files:**
- Modify: `apps/worker/src/jobs/graphify-build.ts`

GRAPH_REPORT.md 이후 wiki/*.md 파일들을 각각 개별 knowledge_page로 import한다.

- [ ] **Step 1: graphify-build.ts의 Step 8 이후에 wiki import 추가**

`processGraphifyBuild` 함수에서 GRAPH_REPORT.md import 이후(약 150행) 다음을 추가:

```typescript
    // 8b. wiki/*.md → individual knowledge pages
    try {
      const wikiDir = join(outDir, 'wiki');
      const wikiFiles = await readdir(wikiDir).catch(() => [] as string[]);
      const mdFiles = wikiFiles.filter((f) => f.endsWith('.md'));

      console.log(`[graphify-build] Found ${mdFiles.length} wiki files`);

      for (const wikiFile of mdFiles) {
        const content = await readFile(join(wikiDir, wikiFile), 'utf-8');
        const title = wikiFile.replace(/\.md$/, '').replace(/_/g, ' ');

        await importAsKnowledgePage({
          workspaceId,
          title: `[Graph] ${title}`,
          slug: `graph-wiki-${snapshotId.slice(0, 8)}-${slugify(title)}`,
          mdxContent: content,
          pageType: 'analysis',
          sensitivity: 'INTERNAL',
          createdBy: requestedBy,
        });
      }
    } catch (err) {
      // Wiki import failure should not fail the entire build
      console.warn(`[graphify-build] Wiki import error: ${err instanceof Error ? err.message : err}`);
    }
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/jobs/graphify-build.ts
git commit -m "feat(graphify): import wiki/*.md files as individual knowledge pages"
```

---

### Task 1.9: Upload route에서 ZIP 시 자동 enqueue

**Files:**
- Modify: `apps/web/app/api/upload/route.ts`

ZIP/tar 업로드 시 ingest와 함께 graphify-build job도 enqueue한다. 설정 기반으로 on/off 가능.

- [ ] **Step 1: upload route.ts에 archive 감지 + graphify-build enqueue 추가**

```typescript
// apps/web/app/api/upload/route.ts — POST handler 마지막 부분 수정
// boss.send('ingest', ...) 이후에 추가:

  // If archive type, also enqueue graphify-build for structural analysis
  const ARCHIVE_TYPES = new Set([
    'application/zip',
    'application/x-tar',
    'application/gzip',
    'application/x-7z-compressed',
  ]);

  const autoGraphify = process.env['GRAPHIFY_AUTO_BUILD'] !== 'false';
  if (autoGraphify && ARCHIVE_TYPES.has(mimeType)) {
    await boss.send('graphify-build', {
      rawSourceId,
      workspaceId: session.workspaceId,
      requestedBy: session.userId,
    });
    console.log(`[upload] Enqueued graphify-build for archive rawSourceId=${rawSourceId}`);
  }

  return NextResponse.json({ rawSourceId }, { status: 201 });
```

- [ ] **Step 2: .env.example에 자동 빌드 설정 추가**

```bash
# .env.example에 추가
GRAPHIFY_AUTO_BUILD=true   # ZIP 업로드 시 자동 graphify-build (false로 비활성화)
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/upload/route.ts .env.example
git commit -m "feat(graphify): auto-enqueue graphify-build on archive upload (configurable)"
```

---

### Task 1.10: Snapshot 목록/상세 API

**Files:**
- Create: `apps/web/app/api/graphify/snapshots/route.ts`
- Create: `apps/web/app/api/graphify/snapshots/[id]/route.ts`
- Create: `apps/web/app/api/graphify/snapshots/[id]/graph/route.ts`

빌드 상태 확인 및 graph.json/html 접근을 위한 API.

- [ ] **Step 1: 목록 API 생성**

```typescript
// apps/web/app/api/graphify/snapshots/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;

  const snapshots = await db
    .select()
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, session.workspaceId))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(50);

  return NextResponse.json({ snapshots });
}
```

- [ ] **Step 2: 상세 API 생성**

```typescript
// apps/web/app/api/graphify/snapshots/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;
  const { id } = await params;

  const [snapshot] = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.id, id),
        eq(graphSnapshot.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
```

- [ ] **Step 3: Graph file presign redirect API 생성**

```typescript
// apps/web/app/api/graphify/snapshots/[id]/graph/route.ts
// MinIO client를 web-side 공유 유틸에서 import (worker의 lib/minio-client.ts 패턴 재사용)
// TODO: packages/storage/minio.ts로 추출하여 worker/web 간 공유 권장

import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and } from 'drizzle-orm';
import { Client } from 'minio';

// 현재는 inline 생성 — 향후 shared package로 추출
const minioClient = new Client({
  endPoint: process.env['MINIO_ENDPOINT']!,
  port: parseInt(process.env['MINIO_PORT'] || '9000'),
  useSSL: process.env['MINIO_USE_SSL'] === 'true',
  accessKey: process.env['MINIO_ACCESS_KEY']!,
  secretKey: process.env['MINIO_SECRET_KEY']!,
});
const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireApiSession(req, 'knowledge:read');
  if (auth.response) return auth.response;
  const { session } = auth;
  const { id } = await params;

  const [snapshot] = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.id, id),
        eq(graphSnapshot.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  // Determine which file to serve based on ?type= query param
  const fileType = req.nextUrl.searchParams.get('type') ?? 'json';
  const storagePath = fileType === 'html' ? snapshot.graphHtmlPath : snapshot.graphJsonPath;

  if (!storagePath) {
    return NextResponse.json(
      { error: `graph.${fileType} not available for this snapshot` },
      { status: 404 },
    );
  }

  // Generate presigned URL (60 seconds)
  const presignedUrl = await minioClient.presignedGetObject(BUCKET, storagePath, 60);

  return NextResponse.redirect(presignedUrl);
}
```

- [ ] **Step 4: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/graphify/
git commit -m "feat(graphify): add snapshot list/detail/graph presign APIs"
```

---

## Phase 2: Architecture Viewer UI (2주)

> graph.html iframe 시각화, snapshot 선택, god nodes 카드, 질문 제안 → Ask AI 연동

---

### Task 2.1: Architecture Viewer 페이지

**Files:**
- Create: `apps/web/app/(app)/architecture/page.tsx`

- [ ] **Step 1: 페이지 컴포넌트 생성**

```tsx
// apps/web/app/(app)/architecture/page.tsx
// 기존 (app) 패턴을 따른다 — workspaceId는 session에서 가져온다.

import { requirePageSession } from '@/lib/server/page-auth';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc, and } from 'drizzle-orm';
import { GraphViewer } from './components/GraphViewer';
import { SnapshotSelector } from './components/SnapshotSelector';
import { GodNodesCard } from './components/GodNodesCard';
import { SuggestedQuestions } from './components/SuggestedQuestions';

interface Props {
  searchParams: Promise<{ snapshot?: string }>;
}

export default async function ArchitecturePage({ searchParams }: Props) {
  const session = await requirePageSession();
  const workspaceId = session.workspaceId;
  const { snapshot: selectedId } = await searchParams;

  // Fetch all completed snapshots
  const snapshots = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.workspaceId, workspaceId),
        eq(graphSnapshot.buildStatus, 'completed'),
      ),
    )
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(20);

  const current = selectedId
    ? snapshots.find((s) => s.id === selectedId) ?? snapshots[0]
    : snapshots[0];

  if (!current) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">Architecture Viewer</h1>
        <p className="text-gray-500">
          아직 Graphify 분석 결과가 없습니다. ZIP 파일을 업로드하거나 수동으로 빌드를 트리거하세요.
        </p>
      </main>
    );
  }

  const metadata = current.analysisMetadata as {
    godNodes?: string[];
    suggestedQuestions?: string[];
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Architecture Viewer</h1>
        <SnapshotSelector snapshots={snapshots} currentId={current.id} />
      </div>

      {/* Graph Viewer */}
      {current.graphHtmlPath ? (
        <GraphViewer snapshotId={current.id} />
      ) : (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          시각화 파일이 없습니다 (--no-viz 모드로 빌드됨)
        </div>
      )}

      {/* Bottom cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GodNodesCard
          godNodes={metadata.godNodes ?? []}
          nodeCount={current.nodeCount ?? 0}
          edgeCount={current.edgeCount ?? 0}
          communityCount={current.communityCount ?? 0}
        />

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Build Info</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Mode</dt>
              <dd>{current.buildMode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Duration</dt>
              <dd>{current.buildDurationMs ? `${(current.buildDurationMs / 1000).toFixed(1)}s` : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Files</dt>
              <dd>{current.fileCount ?? '-'}</dd>
            </div>
          </dl>
        </div>

        <SuggestedQuestions
          questions={metadata.suggestedQuestions ?? []}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/architecture/page.tsx
git commit -m "feat(graphify): add Architecture Viewer page layout"
```

---

### Task 2.2: GraphViewer iframe 컴포넌트

**Files:**
- Create: `apps/web/app/(app)/architecture/components/GraphViewer.tsx`

- [ ] **Step 1: GraphViewer 컴포넌트 생성**

```tsx
// apps/web/app/(app)/architecture/components/GraphViewer.tsx
'use client';

import { useState, useEffect } from 'react';

interface GraphViewerProps {
  snapshotId: string;
}

export function GraphViewer({ snapshotId }: GraphViewerProps) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch presigned URL for graph.html
    fetch(`/api/graphify/snapshots/${snapshotId}/graph?type=html`, {
      redirect: 'manual', // Don't auto-follow redirect — we need the URL
    })
      .then(async (res) => {
        if (res.status === 302 || res.status === 307) {
          // Redirect to MinIO presigned URL
          const location = res.headers.get('Location');
          if (location) {
            setIframeSrc(location);
          } else {
            setError('Redirect URL not found');
          }
        } else if (res.ok) {
          // If the API returns the URL in body instead
          const data = await res.json();
          setIframeSrc(data.url);
        } else {
          setError('Failed to load graph visualization');
        }
      })
      .catch(() => setError('Network error loading graph'))
      .finally(() => setLoading(false));
  }, [snapshotId]);

  if (loading) {
    return (
      <div className="border rounded-lg h-[600px] flex items-center justify-center bg-gray-50">
        <span className="text-gray-400">Loading graph...</span>
      </div>
    );
  }

  if (error || !iframeSrc) {
    return (
      <div className="border rounded-lg h-[600px] flex items-center justify-center bg-gray-50">
        <span className="text-gray-500">{error ?? 'Graph not available'}</span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <iframe
        src={iframeSrc}
        className="w-full h-[600px]"
        sandbox="allow-scripts allow-same-origin"
        title="Architecture Graph"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/GraphViewer.tsx
git commit -m "feat(graphify): add GraphViewer iframe component for graph.html"
```

---

### Task 2.3: SnapshotSelector 컴포넌트

**Files:**
- Create: `apps/web/app/(app)/architecture/components/SnapshotSelector.tsx`

- [ ] **Step 1: SnapshotSelector 생성**

```tsx
// apps/web/app/(app)/architecture/components/SnapshotSelector.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';

interface Snapshot {
  id: string;
  title: string;
  createdAt: string;
  buildMode: string;
}

interface SnapshotSelectorProps {
  snapshots: Snapshot[];
  currentId: string;
}

export function SnapshotSelector({ snapshots, currentId }: SnapshotSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={currentId}
      onChange={(e) => router.push(`${pathname}?snapshot=${e.target.value}`)}
      className="border rounded px-3 py-1.5 text-sm"
    >
      {snapshots.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title} ({new Date(s.createdAt).toLocaleDateString()})
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/SnapshotSelector.tsx
git commit -m "feat(graphify): add SnapshotSelector dropdown component"
```

---

### Task 2.4: GodNodesCard + SuggestedQuestions 컴포넌트

**Files:**
- Create: `apps/web/app/(app)/architecture/components/GodNodesCard.tsx`
- Create: `apps/web/app/(app)/architecture/components/SuggestedQuestions.tsx`

- [ ] **Step 1: GodNodesCard 생성**

```tsx
// apps/web/app/(app)/architecture/components/GodNodesCard.tsx

interface GodNodesCardProps {
  godNodes: string[];
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
}

export function GodNodesCard({ godNodes, nodeCount, edgeCount, communityCount }: GodNodesCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">God Nodes</h3>
      <p className="text-xs text-gray-500 mb-3">
        {nodeCount} nodes / {edgeCount} edges / {communityCount} communities
      </p>
      {godNodes.length === 0 ? (
        <p className="text-sm text-gray-400">No god nodes detected</p>
      ) : (
        <ul className="space-y-1">
          {godNodes.map((node, i) => (
            <li key={i} className="text-sm flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                {i + 1}
              </span>
              {node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SuggestedQuestions 생성**

```tsx
// apps/web/app/(app)/architecture/components/SuggestedQuestions.tsx
'use client';

import { useRouter } from 'next/navigation';

interface SuggestedQuestionsProps {
  questions: string[];
}

export function SuggestedQuestions({ questions }: SuggestedQuestionsProps) {
  const router = useRouter();

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">Suggested Questions</h3>
      {questions.length === 0 ? (
        <p className="text-sm text-gray-400">No suggestions available</p>
      ) : (
        <ul className="space-y-2">
          {questions.slice(0, 5).map((q, i) => (
            <li key={i}>
              <button
                className="text-sm text-left text-blue-600 hover:underline"
                onClick={() => router.push(`/ask?q=${encodeURIComponent(q)}`)}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/architecture/components/
git commit -m "feat(graphify): add GodNodesCard and SuggestedQuestions components"
```

---

## Phase 3: Graph-Aware Ask AI (2주)

> graph_node/edge/community DB materialization + Ask AI에 graph context 주입

---

### Task 3.1: graph_node/edge/community 테이블 스키마

**Files:**
- Modify: `packages/db/schema/graph.ts`

- [ ] **Step 1: graph.ts에 Phase 3 테이블 추가**

`packages/db/schema/graph.ts`의 `graphSnapshot` 정의 아래에 추가:

```typescript
// packages/db/schema/graph.ts — graphSnapshot 아래에 추가

export const graphNode = pgTable('graph_node', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 500 }).notNull(),
  label: varchar('label', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  sourceFile: varchar('source_file', { length: 1000 }),
  sourceLocation: varchar('source_location', { length: 50 }),
  communityId: integer('community_id'),
  metadata: jsonb('metadata')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotNodeIdx: index('idx_graph_node_snapshot_node').on(table.snapshotId, table.nodeId),
  communityIdx: index('idx_graph_node_community').on(table.snapshotId, table.communityId),
  labelIdx: index('idx_graph_node_label').on(table.label),
}));

export const graphEdge = pgTable('graph_edge', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  sourceNodeId: varchar('source_node_id', { length: 500 }).notNull(),
  targetNodeId: varchar('target_node_id', { length: 500 }).notNull(),
  relation: varchar('relation', { length: 100 }).notNull(),
  confidence: varchar('confidence', { length: 20 }).notNull(),
  confidenceScore: varchar('confidence_score', { length: 10 }),
  sourceFile: varchar('source_file', { length: 1000 }),
  weight: varchar('weight', { length: 10 }).default('1.0'),
  metadata: jsonb('metadata')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotSourceIdx: index('idx_graph_edge_snapshot_source').on(table.snapshotId, table.sourceNodeId),
  snapshotTargetIdx: index('idx_graph_edge_snapshot_target').on(table.snapshotId, table.targetNodeId),
  relationIdx: index('idx_graph_edge_relation').on(table.snapshotId, table.relation),
}));

export const graphCommunity = pgTable('graph_community', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  communityId: integer('community_id').notNull(),
  label: varchar('label', { length: 500 }),
  nodeCount: integer('node_count').notNull(),
  cohesionScore: varchar('cohesion_score', { length: 10 }),
  topNodes: jsonb('top_nodes')
    .$type<string[]>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Migration 생성 및 적용**

Run: `cd packages/db && npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: graph_node, graph_edge, graph_community 테이블 생성

- [ ] **Step 3: Commit**

```bash
git add packages/db/schema/graph.ts
git commit -m "feat(graphify): add graph_node, graph_edge, graph_community tables for Phase 3"
```

---

### Task 3.2: graph.json → DB materialization

**Files:**
- Create: `apps/worker/src/helpers/materialize-graph.ts`
- Modify: `apps/worker/src/jobs/graphify-build.ts`

- [ ] **Step 1: materialize-graph.ts 생성**

```typescript
// apps/worker/src/helpers/materialize-graph.ts

import { db } from '@jarvis/db/client';
import { graphNode, graphEdge, graphCommunity } from '@jarvis/db/schema/graph';

interface GraphJsonNode {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community?: number;
}

interface GraphJsonLink {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  confidence_score?: number;
  _src?: string;
  _tgt?: string;
  weight?: number;
}

interface GraphJson {
  nodes: GraphJsonNode[];
  links: GraphJsonLink[];
}

const BATCH_SIZE = 500;

/**
 * Bulk inserts graph.json data into graph_node, graph_edge, graph_community tables.
 * Returns summary statistics.
 */
export async function materializeGraph(
  snapshotId: string,
  graphJson: GraphJson,
): Promise<{ nodeCount: number; edgeCount: number; communityCount: number }> {
  // 1. Batch insert nodes
  for (let i = 0; i < graphJson.nodes.length; i += BATCH_SIZE) {
    const batch = graphJson.nodes.slice(i, i + BATCH_SIZE);
    await db.insert(graphNode).values(
      batch.map((n) => ({
        snapshotId,
        nodeId: n.id,
        label: n.label,
        fileType: n.file_type,
        sourceFile: n.source_file,
        sourceLocation: n.source_location,
        communityId: n.community,
      })),
    );
  }

  // 2. Batch insert edges
  for (let i = 0; i < graphJson.links.length; i += BATCH_SIZE) {
    const batch = graphJson.links.slice(i, i + BATCH_SIZE);
    await db.insert(graphEdge).values(
      batch.map((e) => ({
        snapshotId,
        sourceNodeId: e._src ?? e.source,
        targetNodeId: e._tgt ?? e.target,
        relation: e.relation,
        confidence: e.confidence,
        confidenceScore: e.confidence_score?.toString(),
        weight: e.weight?.toString(),
      })),
    );
  }

  // 3. Compute and insert communities
  const communityMap = new Map<number, GraphJsonNode[]>();
  for (const node of graphJson.nodes) {
    if (node.community == null) continue;
    if (!communityMap.has(node.community)) communityMap.set(node.community, []);
    communityMap.get(node.community)!.push(node);
  }

  // Count edges per node for ranking
  const edgeCounts = new Map<string, number>();
  for (const link of graphJson.links) {
    const src = link._src ?? link.source;
    const tgt = link._tgt ?? link.target;
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
    edgeCounts.set(tgt, (edgeCounts.get(tgt) ?? 0) + 1);
  }

  for (const [cid, nodes] of communityMap) {
    const topNodes = nodes
      .sort((a, b) => (edgeCounts.get(b.id) ?? 0) - (edgeCounts.get(a.id) ?? 0))
      .slice(0, 5)
      .map((n) => n.label);

    await db.insert(graphCommunity).values({
      snapshotId,
      communityId: cid,
      label: topNodes[0] ?? `Community ${cid}`,
      nodeCount: nodes.length,
      topNodes,
    });
  }

  return {
    nodeCount: graphJson.nodes.length,
    edgeCount: graphJson.links.length,
    communityCount: communityMap.size,
  };
}
```

- [ ] **Step 2: graphify-build.ts에서 materializeGraph 호출 추가**

`apps/worker/src/jobs/graphify-build.ts`의 graph.json 파싱 섹션(Step 9)에서 materializeGraph를 호출:

```typescript
// graphify-build.ts — graph.json 파싱 블록 내부에 추가
// import 추가 (파일 상단):
import { materializeGraph } from '../helpers/materialize-graph.js';

// Step 9 블록 내부, graph.json 파싱 후:
    try {
      const graphJsonRaw = await readFile(join(outDir, 'graph.json'), 'utf-8');
      const graphJson = JSON.parse(graphJsonRaw);

      // Materialize to DB tables
      const stats = await materializeGraph(snapshotId, graphJson);
      nodeCount = stats.nodeCount;
      edgeCount = stats.edgeCount;
      communityCount = stats.communityCount;

      // ... (기존 god nodes 추출 코드 유지)
    }
```

- [ ] **Step 3: 타입 체크**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/helpers/materialize-graph.ts apps/worker/src/jobs/graphify-build.ts
git commit -m "feat(graphify): materialize graph.json into graph_node/edge/community tables"
```

---

### Task 3.3: retrieveRelevantGraphContext

**Files:**
- Create: `packages/ai/graph-context.ts`

Ask AI가 질문에서 키워드를 추출하고, graph_node FTS 매칭 → 1-hop 이웃 → shortest path CTE를 통해 구조 컨텍스트를 가져온다.

- [ ] **Step 1: graph-context.ts 생성**

```typescript
// packages/ai/graph-context.ts

import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface GraphNodeResult {
  nodeId: string;
  label: string;
  fileType: string | null;
  sourceFile: string | null;
  communityLabel: string | null;
  connections: { relation: string; targetLabel: string; confidence: string }[];
}

export interface GraphPath {
  from: string;
  to: string;
  hops: string[]; // node labels in order
}

export interface GraphContext {
  matchedNodes: GraphNodeResult[];
  paths: GraphPath[];
  communityContext: string;
}

/**
 * Extracts keywords from a question for graph node matching.
 * Simple approach: split on whitespace, filter stopwords, keep tokens > 2 chars.
 */
function extractKeywords(question: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'this', 'that', 'it', 'what', 'how',
    'why', 'when', 'where', 'who', 'which',
    // Korean stopwords
    '이', '가', '은', '는', '을', '를', '에', '의', '로', '와', '과',
    '도', '만', '에서', '까지', '부터', '하고', '이나', '나',
  ]);

  return question
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w.toLowerCase()))
    .map((w) => w.toLowerCase())
    .slice(0, 10); // max 10 keywords
}

/**
 * Retrieves graph context relevant to a question.
 * Returns matched nodes with their connections, paths between matched nodes,
 * and community context.
 *
 * Returns null if no graph snapshot exists or no nodes match.
 */
export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
): Promise<GraphContext | null> {
  // 1. Find latest completed snapshot
  const [snapshot] = await db
    .select({ id: graphSnapshot.id })
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.workspaceId, workspaceId),
        eq(graphSnapshot.buildStatus, 'completed'),
      ),
    )
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(1);

  if (!snapshot) return null;

  // 2. Extract keywords
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return null;

  // 3. Match graph nodes via label ILIKE
  const likePatterns = keywords.map((k) => `%${k}%`);
  const matchedRows = await db.execute<{
    node_id: string;
    label: string;
    file_type: string | null;
    source_file: string | null;
    community_id: number | null;
    community_label: string | null;
  }>(sql`
    SELECT
      gn.node_id, gn.label, gn.file_type, gn.source_file,
      gn.community_id,
      gc.label AS community_label
    FROM graph_node gn
    LEFT JOIN graph_community gc
      ON gc.snapshot_id = gn.snapshot_id AND gc.community_id = gn.community_id
    WHERE gn.snapshot_id = ${snapshot.id}::uuid
      AND gn.label ILIKE ANY(${likePatterns}::text[])
    LIMIT 10
  `);

  if (matchedRows.rows.length === 0) return null;

  // 4. Get 1-hop neighbors for matched nodes
  const nodeIds = matchedRows.rows.map((r) => r.node_id);
  const neighborRows = await db.execute<{
    source_node_id: string;
    target_node_id: string;
    relation: string;
    confidence: string;
    source_label: string;
    target_label: string;
  }>(sql`
    SELECT
      ge.source_node_id, ge.target_node_id, ge.relation, ge.confidence,
      gn_src.label AS source_label, gn_tgt.label AS target_label
    FROM graph_edge ge
    JOIN graph_node gn_src
      ON gn_src.snapshot_id = ge.snapshot_id AND gn_src.node_id = ge.source_node_id
    JOIN graph_node gn_tgt
      ON gn_tgt.snapshot_id = ge.snapshot_id AND gn_tgt.node_id = ge.target_node_id
    WHERE ge.snapshot_id = ${snapshot.id}::uuid
      AND (ge.source_node_id = ANY(${nodeIds}::text[]) OR ge.target_node_id = ANY(${nodeIds}::text[]))
    LIMIT 50
  `);

  // Build connections for each matched node
  const matchedNodes: GraphNodeResult[] = matchedRows.rows.map((row) => {
    const connections = neighborRows.rows
      .filter((e) => e.source_node_id === row.node_id || e.target_node_id === row.node_id)
      .map((e) => ({
        relation: e.relation,
        targetLabel: e.source_node_id === row.node_id ? e.target_label : e.source_label,
        confidence: e.confidence,
      }));

    return {
      nodeId: row.node_id,
      label: row.label,
      fileType: row.file_type,
      sourceFile: row.source_file,
      communityLabel: row.community_label,
      connections,
    };
  });

  // 5. Shortest path between first two matched nodes (if 2+ matches)
  const paths: GraphPath[] = [];
  if (matchedRows.rows.length >= 2) {
    const fromId = matchedRows.rows[0]!.node_id;
    const toId = matchedRows.rows[1]!.node_id;

    const pathRows = await db.execute<{ path: string[]; depth: number }>(sql`
      WITH RECURSIVE path_search AS (
        SELECT
          source_node_id AS current_node,
          target_node_id AS next_node,
          ARRAY[source_node_id] AS visited,
          1 AS depth
        FROM graph_edge
        WHERE snapshot_id = ${snapshot.id}::uuid
          AND source_node_id = ${fromId}

        UNION ALL

        SELECT
          ps.next_node,
          ge.target_node_id,
          ps.visited || ps.next_node,
          ps.depth + 1
        FROM path_search ps
        JOIN graph_edge ge
          ON ge.snapshot_id = ${snapshot.id}::uuid
          AND ge.source_node_id = ps.next_node
        WHERE ps.depth < 5
          AND NOT ps.next_node = ANY(ps.visited)
      )
      SELECT visited || next_node AS path, depth
      FROM path_search
      WHERE next_node = ${toId}
      ORDER BY depth ASC
      LIMIT 1
    `);

    if (pathRows.rows.length > 0) {
      const pathNodeIds = pathRows.rows[0]!.path;
      // Resolve node IDs to labels
      const labelRows = await db.execute<{ node_id: string; label: string }>(sql`
        SELECT node_id, label FROM graph_node
        WHERE snapshot_id = ${snapshot.id}::uuid
          AND node_id = ANY(${pathNodeIds}::text[])
      `);
      const labelMap = new Map(labelRows.rows.map((r) => [r.node_id, r.label]));

      paths.push({
        from: labelMap.get(pathNodeIds[0]!) ?? pathNodeIds[0]!,
        to: labelMap.get(pathNodeIds[pathNodeIds.length - 1]!) ?? pathNodeIds[pathNodeIds.length - 1]!,
        hops: pathNodeIds.map((id) => labelMap.get(id) ?? id),
      });
    }
  }

  // 6. Community context
  const communityIds = [
    ...new Set(matchedRows.rows.map((r) => r.community_id).filter((c): c is number => c != null)),
  ];
  let communityContext = '';
  if (communityIds.length > 0) {
    const commRows = await db.execute<{
      community_id: number;
      label: string;
      node_count: number;
      top_nodes: string[];
    }>(sql`
      SELECT community_id, label, node_count, top_nodes
      FROM graph_community
      WHERE snapshot_id = ${snapshot.id}::uuid
        AND community_id = ANY(${communityIds}::int[])
    `);
    communityContext = commRows.rows
      .map((c) => `Community "${c.label}" (${c.node_count} nodes): ${(c.top_nodes ?? []).join(', ')}`)
      .join('\n');
  }

  return { matchedNodes, paths, communityContext };
}

/**
 * Formats GraphContext into XML for Ask AI system prompt injection.
 */
export function formatGraphContextXml(ctx: GraphContext): string {
  const nodesXml = ctx.matchedNodes
    .map((n) => {
      const conns = n.connections
        .slice(0, 5) // limit connections per node
        .map((c) => `      <connection relation="${c.relation}" target="${c.targetLabel}" confidence="${c.confidence}" />`)
        .join('\n');
      return `    <node label="${n.label}" type="${n.fileType ?? 'unknown'}" file="${n.sourceFile ?? ''}" community="${n.communityLabel ?? ''}">
${conns}
    </node>`;
    })
    .join('\n');

  const pathsXml = ctx.paths
    .map((p) => `    <path from="${p.from}" to="${p.to}">\n      ${p.hops.join(' --> ')}\n    </path>`)
    .join('\n');

  return `<graph_context>
  <matched_nodes>
${nodesXml}
  </matched_nodes>
  <paths>
${pathsXml}
  </paths>
  <community_context>
    ${ctx.communityContext}
  </community_context>
</graph_context>`;
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd packages/ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add packages/ai/graph-context.ts
git commit -m "feat(graphify): add retrieveRelevantGraphContext with FTS, 1-hop neighbors, shortest path CTE"
```

---

### Task 3.4: Ask AI에 graph context 주입

**Files:**
- Modify: `packages/ai/ask.ts`

기존 텍스트 RAG context와 graph context를 병렬로 가져와 Claude 프롬프트에 함께 주입한다.

- [ ] **Step 1: ask.ts에 graph context import 및 병렬 retrieval 추가**

```typescript
// packages/ai/ask.ts — 파일 상단에 import 추가:
import { retrieveRelevantGraphContext, formatGraphContextXml, type GraphContext } from './graph-context.js';

// SYSTEM_PROMPT 수정 (124행):
const SYSTEM_PROMPT = `You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided context sources and graph context. Do not use outside knowledge.
For each factual claim in your answer, cite the source using [source:N] notation where N is the source id.
If multiple sources support a claim, cite all relevant ones: [source:1][source:2].
For structure-based answers (architecture, dependencies, connections), reference the graph context.
When a question asks about relationships, dependencies, or "how does X connect to Y", prefer the graph context over text sources.
If the context doesn't contain enough information to answer the question, say so explicitly and suggest the user search the knowledge base or contact the relevant team.
Keep answers concise and professional. Use the same language as the user's question.`;
```

- [ ] **Step 2: askAI 함수에서 graph context를 병렬 retrieval**

```typescript
// packages/ai/ask.ts — askAI 함수 수정 (205행~):

export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions } = query;

  // Parallel retrieval: text claims + graph context
  let claims: RetrievedClaim[];
  let graphCtx: GraphContext | null;

  try {
    [claims, graphCtx] = await Promise.all([
      retrieveRelevantClaims(question, workspaceId, userPermissions),
      retrieveRelevantGraphContext(question, workspaceId).catch(() => null),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retrieval failed';
    yield { type: 'error', message };
    return;
  }

  if (claims.length === 0 && !graphCtx) {
    yield {
      type: 'text',
      content:
        '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.',
    };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    return;
  }

  // Assemble combined context
  let context = assembleContext(claims);
  if (graphCtx && graphCtx.matchedNodes.length > 0) {
    context += '\n\n' + formatGraphContextXml(graphCtx);
  }

  yield* generateAnswer(question, context, claims);
}
```

- [ ] **Step 3: 타입 체크**

Run: `cd packages/ai && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add packages/ai/ask.ts
git commit -m "feat(graphify): inject graph context into Ask AI — parallel retrieval with text claims"
```

---

### Task 3.5: ResourceType 'graph' 확장

**Files:**
- Modify: `packages/search/types.ts`

검색 결과에 graph node도 포함할 수 있도록 ResourceType을 확장한다.

- [ ] **Step 1: types.ts에 'graph' 타입 추가**

```typescript
// packages/search/types.ts — 2행 수정:
export type ResourceType = 'knowledge' | 'project' | 'system' | 'graph';
```

- [ ] **Step 2: 타입 체크**

Run: `cd packages/search && npx tsc --noEmit`
Expected: 에러 없음 (기존 코드는 SearchHit.resourceType을 string으로 다루므로 breaking change 없음)

- [ ] **Step 3: Commit**

```bash
git add packages/search/types.ts
git commit -m "feat(graphify): add 'graph' to ResourceType for graph node search results"
```

---

## Appendix: 운영 체크리스트

### A. API Key 보안

- [ ] `.env` 파일에 `GRAPHIFY_API_KEY` 설정 (`.gitignore`로 보호)
- [ ] `C:\Users\kms\Desktop\dev\jarvis_claude_key.txt` 원본 파일은 레포 외부에 유지
- [ ] Docker 배포 시 Docker secrets 또는 환경변수로 주입
- [ ] 코드 내 API key 하드코딩 여부 주기적 확인 (`grep -r "sk-ant" .` 실행)

### B. 모델 전환 가이드

현재: `GRAPHIFY_MODEL=claude-haiku-4-5-20251001` (비용 최적화)

성능 부족 시:
1. `.env`에서 `GRAPHIFY_MODEL=claude-sonnet-4-5-20250514`로 변경
2. worker 재시작
3. 새 빌드 트리거하여 결과 비교

### C. 리소스 가드

| 가드 | 기본값 | 환경변수 |
|------|--------|----------|
| Archive 최대 크기 | 200MB | `GRAPHIFY_MAX_ARCHIVE_MB` |
| 최대 파일 수 | 5,000 | `GRAPHIFY_MAX_FILE_COUNT` |
| 실행 타임아웃 | 10분 | `GRAPHIFY_TIMEOUT_MS` |
| subprocess maxBuffer | 50MB | (하드코딩) |
| embed chunk 상한 | 500 | (기존 embed.ts MAX_CHUNKS) |

### D. Phase별 검증 포인트

**Phase 0 완료 후:**
- [ ] compile job 완료 → embed job 자동 enqueue 확인 (worker 로그)
- [ ] E2E: VIEWER 세션에 knowledge:read 등 4개 권한 포함 확인
- [ ] ZIP ingest: placeholder 메시지에 Graphify 파이프라인 안내 포함 확인

**Phase 1A 완료 후:**
- [ ] `POST /api/graphify/build` → graph_snapshot 레코드 생성
- [ ] GRAPH_REPORT.md → knowledge_page 검색 가능
- [ ] graph.json → MinIO 저장 확인

**Phase 1B 완료 후:**
- [ ] wiki/*.md → 개별 knowledge_page 생성
- [ ] ZIP 업로드 → 자동 graphify-build enqueue

**Phase 2 완료 후:**
- [ ] /architecture 페이지 렌더링
- [ ] graph.html iframe 표시
- [ ] SuggestedQuestions → Ask AI 연동

**Phase 3 완료 후:**
- [ ] graph_node/edge DB 데이터 존재
- [ ] Ask AI에 `<graph_context>` 포함
- [ ] "이 함수는 어떤 모듈과 연결되어 있나?" 질문에 graph path 포함 답변
