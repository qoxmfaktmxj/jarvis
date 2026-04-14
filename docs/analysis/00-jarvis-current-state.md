# 00 — Jarvis AS-IS 현황 분석

> **작성일:** 2026-04-14  
> **작성자:** Claude (jolly-antonelli worktree)  
> **목적:** graphify, llm_wiki, llm-wiki-agent, mindvault, qmd 5개 레퍼런스 프로젝트에서 아이디어를 통합하기 전에 Jarvis의 현재 상태를 정확히 파악. 이 문서가 이후 통합 판단(무엇을 가져올지·어떻게 붙일지)의 베이스라인.
>
> **방법론:** git log 30개, README·CLAUDE.md·AGENTS.md·CURRENT_STATE.md 정독, packages/db/schema/ 17개 파일, apps/web/app/ 전 라우트, packages/ai 전 파일, worker jobs/ 7개, .claude 하네스 3인 에이전트 + 4 스킬 확인. 추측 없이 file:line 인용 기반.

---

## 1. 프로젝트 개요

### 1.1 정체성

Jarvis는 **“사내 업무 시스템 + 사내 위키 + RAG AI 포털”을 단일 TypeScript 모노레포로 통합한 엔터프라이즈 포털**이다. 공식 설명(`AGENTS.md:9`):

> Jarvis = 사내 업무 시스템 + 사내 위키 + RAG AI 포털을 하나의 TypeScript 모노레포로 통합한 엔터프라이즈 포털. Next.js 15 App Router + Drizzle + PostgreSQL(pgvector) + Redis + MinIO + pg-boss. 5000명 규모 배포를 목표로 한다.

`README.md:3`은 표현이 조금 다르다:

> AI 비서와 사내 지식 검색이 결합된 사내 업무 시스템 모노레포입니다. … **사내 위키/시스템/프로젝트/근태 데이터를 한 곳에서 조회하고**, **6개 검색 레인 기반 질의응답으로 필요한 정보를 빠르게 찾는 것**을 목표로 합니다.

두 설명이 교차하면 Jarvis는 다음 4개 축이 하나로 묶인 제품이다.

1. **업무 시스템 CRUD** — 프로젝트·시스템·근태·조직·사용자·회사·코드·감사 로그 (`packages/db/schema/`의 project/system/attendance/tenant/user/company/code/audit)
2. **사내 위키** — 4-표면 지식 모델 (canonical/directory/case/derived) + 버전 관리 + 태그 + 리뷰 (`packages/db/schema/knowledge.ts`, `directory.ts`, `case.ts`)
3. **RAG AI 포털** — 6-레인 라우터 + 하이브리드 검색 + OpenAI 생성 + SSE 스트리밍 + AnswerCard (`packages/ai/router.ts`, `ask.ts`, `apps/web/app/api/ask/route.ts`)
4. **코드 분석 부가 파이프라인** — Graphify subprocess + graph_snapshot/node/edge/community (`apps/worker/src/jobs/graphify-build.ts`, `packages/db/schema/graph.ts`)

### 1.2 완성도 자평

`docs/CURRENT_STATE.md:20`은 “production-ready”를 명시:

> All architecture phases (0-6) are complete. The system is ready for:
> 1. Extended test coverage
> 2. CI/CD pipeline automation
> 3. Production observability tuning

Phase 0~6 완료 목록(`CURRENT_STATE.md:29-38`):

| Phase | 목표 | 상태 | 핵심 산출물 |
|-------|------|------|------------|
| 0 | Foundation (schema, auth, search) | ✓ | 39-table schema, OIDC, RBAC |
| 1 | Core RAG (embeddings, retrieval) | ✓ | OpenAI embeddings, vector search |
| 2 | Case Layer (TSVD999 import) | ✓ | 74,342 cases, TF-IDF clustering |
| 3 | Directory & Router (6-lane) | ✓ | 31 directory entries, keyword router |
| 4 | Graphify Integration | ✓ | Code analysis, graph export, wiki generation |
| 5 | UI Features (Simple/Expert, Tutor) | ✓ | Mode toggle, AnswerCard, HR tutor |
| 6 | Knowledge Quality (Radar, Drift) | ✓ | Stale detection, consistency checking |

### 1.3 실제 코드 기준 완성도 점검

문서가 과장 없는지 실제 코드로 교차 검증:

- **39테이블:** `packages/db/schema/` 17개 ts 파일에서 drizzle 테이블 export. CURRENT_STATE 카운트(Knowledge 5 + Case 3 + Directory 1 + Graph 4 + Project 4 + System 2 + Attendance 3 + Search/Audit 8 + User/Tenant 9 + Code/Company 2 = 41)가 존재. 실제로 `case.ts`는 2테이블, `knowledge.ts`는 5테이블 등으로 CURRENT_STATE.md 기재가 코드와 일관적.
- **OpenAI 생성 마이그레이션 완료:** `packages/ai/ask.ts:4`에서 `import OpenAI from 'openai'`, `ask.ts:42` `ASK_MODEL = process.env['ASK_AI_MODEL'] ?? 'gpt-4.1-mini'`. Anthropic은 `packages/ai/package.json:17`에 의존성 남아있지만(`@anthropic-ai/sdk ^0.30.0`) Ask 경로에서 호출은 제거됨 — 코드와 문서가 일치.
- **6-lane 라우터 실제 존재:** `packages/ai/router.ts:12-18`에 6개 AskLane 타입 정의, 147줄 `routeQuestion()`에 가중치 기반 매칭.
- **Graphify subprocess:** `apps/worker/src/jobs/graphify-build.ts:154` `execFileAsync(GRAPHIFY_BIN, args, …)`로 실제 subprocess 호출. `graphify-build.ts:160` 환경변수 allowlist(`PATH, HOME, TMPDIR, ANTHROPIC_API_KEY, GRAPHIFY_MODEL, LANG`).
- **Knowledge Debt Radar / Drift Detection:** `apps/web/app/actions/knowledge-debt.ts`(141줄), `apps/web/app/actions/drift-detection.ts`(207줄) 실제 구현. 서버 액션이며 세션 검증(`drift-detection.ts:61-66`).

**결론:** CURRENT_STATE.md의 주장은 코드와 거의 일치. 다만 “production-ready”는 테스트·CI·관측 부족(아래 §10 갭 참조)을 감안하면 “기능 완성, 운영 미완성” 수준.

---

## 2. 모노레포 구조 상세

### 2.1 루트 레이아웃

`pnpm-workspace.yaml:1-4`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

루트 `package.json`의 `"packageManager": "pnpm@10.33.0"`, `"engines": {"node": ">=22.0.0", "pnpm": ">=9.0.0"}`. 루트는 turbo 오케스트레이터만 가지고 실제 서비스 코드는 apps/와 packages/로 분리.

`turbo.json:1-45`는 task 7종(`build, dev, test, lint, type-check, generate, migrate`) 정의. `build`는 `^build` dependency + `.next/**` outputs. `dev`는 `cache: false, persistent: true`.

### 2.2 apps/web

**역할:** Next.js 15 App Router 기반 웹 프런트엔드 + API routes + server actions.

**구조:**
- `apps/web/app/(app)/` — 인증 필요 라우트 (10개 도메인)
  - `admin/` — audit, codes, companies, menus, organizations, review-queue, search-analytics, settings, users
  - `architecture/` — graphify 시각화
  - `ask/` — 6-lane 라우터 기반 AI 질문
  - `attendance/` — out-manage 서브라우트
  - `dashboard/` — 8개 위젯 (StatCard, AttendanceSummary, MyTasks, ProjectStats, QuickLinks, RecentActivity, SearchTrends, StalePages)
  - `knowledge/` — FAQ, glossary, HR, onboarding, tools 서브라우트 + `[pageId]`의 edit/history/review
  - `profile/` — ProfileInfo, QuickMenuEditor
  - `projects/`, `systems/` — `[id]` 동적 라우트에 layout + 탭 구조 (inquiries, staff, tasks / access, deploy, runbook)
  - `search/` — 하이브리드 검색 UI
- `apps/web/app/(auth)/login/` — 공개 라우트
- `apps/web/app/actions/` — `drift-detection.ts`, `knowledge-debt.ts`, `profile.ts` (server actions at app-level)
- `apps/web/app/api/` — 11개 API route 그룹(admin, ask, attendance, auth, graphify, health, knowledge, projects, search, systems, upload)
- `apps/web/components/` — 전역 공유 컴포넌트 (admin, ai, attendance, knowledge, layout, project, search, system, ui(20개 shadcn), upload)
- `apps/web/lib/` — server helpers (auth/dev-accounts, hooks/useAskAI, queries, server/api-auth + page-auth)
- `apps/web/messages/ko.json` — **305개 키, 13개 최상위 네임스페이스**(Admin, Dashboard, Profile, Projects, Systems, Attendance, Ask, Common, Architecture, OutManage, AttendanceCalendar, Knowledge, System)
- `apps/web/e2e/` — 11개 Playwright spec 파일
- `apps/web/middleware.ts` — 세션 쿠키 검사, 세션 없으면 `/login`으로 리다이렉트 (33줄)

**주요 의존성(`apps/web/package.json`):** Next 15.2.4, React 19, next-intl 4.9, Drizzle 0.45, Tailwind 4.1.3, lucide-react, react-hook-form 7.54, zod 3.24, minio 8, pg-boss 10, ioredis 5.4, react-markdown 10, remark-gfm 4, diff 8.

### 2.3 apps/worker

**역할:** pg-boss 기반 백그라운드 작업 프로세서. 별도 프로세스로 실행.

**구조(`apps/worker/src/`):**
- `index.ts` (52줄) — pg-boss 초기화, 7개 핸들러 등록, 3개 스케줄(check-freshness 매일 09:00, aggregate-popular 주 일 00:00, cleanup 매월 1일 00:00)
- `jobs/` — 7개 핸들러
  - `ingest.ts` (129줄) — MinIO에서 파일 다운로드 → PDF/DOCX/text/JSON/archive 텍스트 추출 → `raw_source.parsed_content` 저장
  - `embed.ts` (103줄) — knowledge_page 최신 버전 MDX → chunkText(300,50) → OpenAI text-embedding-3-small → `knowledge_claim` 원자적 swap (transaction)
  - `compile.ts` (79줄) — 마크다운 strip → summary 500자 → embed 잡 체이닝
  - `graphify-build.ts` (347줄) — 아카이브 다운로드 → unarchive → `.graphifyignore` 주입 → Graphify subprocess → graph.json/html/wiki 처리 → MinIO 업로드 → knowledge_page 승격 → materializeGraph
  - `stale-check.ts` (49줄) — 매일 09:00 실행, review_cycle_days 초과 문서 탐지 → audit_log에 `page.stale` 삽입
  - `aggregate-popular.ts` (49줄) — 주 일요일 00:00, popular_search 집계
  - `cleanup.ts` (40줄) — 매월 1일, 로그/버전 보존
- `lib/` — boss.ts, minio-client.ts (+ test), pdf-parser.ts, text-chunker.ts (+ test)
- `helpers/` — unarchive, import-knowledge, resolve-lineage, materialize-graph (graphify-build 보조)

**의존성(`apps/worker/package.json`):** pg-boss, openai (embeddings), mammoth, pdfjs-dist, minio, drizzle. `@jarvis/ai` 포함하므로 ai 패키지의 일부 로직을 worker가 공유.

### 2.4 packages/*

| 패키지 | 역할 | 외부 export | 주요 파일 |
|--------|------|-------------|-----------|
| `@jarvis/db` | Drizzle 스키마 + Postgres/Redis 클라이언트 + 마이그레이션 | `.`, `./client`, `./redis`, `./schema`, `./schema/*` | `client.ts`, `redis.ts`, `schema/*.ts` 17개, `drizzle/` 마이그레이션 9개 |
| `@jarvis/auth` | OIDC + Redis 세션 + RBAC + sensitivity 술어 | `.`, `./types`, `./session`, `./rbac`, `./oidc` | `session.ts`(48줄), `rbac.ts`(192줄), `oidc.ts` |
| `@jarvis/ai` | 6-레인 라우터, embed, ask, graph-context, case-context, directory-context, tutor, types | `.`, `./types`, `./embed`, `./ask` | `router.ts`(204줄), `ask.ts`(446줄), `embed.ts`(49줄), `case-context.ts`(294줄), `directory-context.ts`(201줄), `graph-context.ts`(343줄), `tutor.ts`(188줄), `types.ts`(99줄) |
| `@jarvis/search` | 하이브리드 검색(FTS + trigram + pgvector + synonym + facet) + 폴백체인 | 10개 서브경로 | `pg-search.ts`(456줄), `hybrid-ranker.ts`, `query-parser.ts`, `synonym-resolver.ts`, `facet-counter.ts`, `fallback-chain.ts`, `highlighter.ts`, `explain.ts` |
| `@jarvis/shared` | 권한 상수, 공통 타입, Zod validation | `.`, `./types`, `./constants`, `./validation` | `constants/permissions.ts`(86줄), `validation/{knowledge,project,search,system}.ts`, `types/{api,common,page}.ts` |
| `@jarvis/secret` | secret reference 추상화 | `.`, `./types` | 작은 유틸 |

### 2.5 공유 의존성 매핑

```
apps/web     → @jarvis/{ai, auth, db, search, secret, shared}
apps/worker  → @jarvis/{ai, db, shared}
@jarvis/ai   → @jarvis/{auth, db, shared}
@jarvis/auth → @jarvis/{db, shared}
@jarvis/search → @jarvis/{auth, db}
```

워커는 auth/search/secret을 사용하지 않고 ai/db/shared만 import — 워커가 HTTP 세션 문맥 바깥에서 동작한다는 설계.

---

## 3. 기술 스택 전체 매핑

### 3.1 런타임 / 프레임워크

| 항목 | 값 | 출처 |
|------|-----|------|
| Node | `>=22.0.0` | `package.json:25` |
| pnpm | `>=9.0.0` (실제 `10.33.0`) | `package.json:4, 25` |
| Turbo | `^2.3.3` | `package.json:21` |
| Next.js | `^15.2.4` | `apps/web/package.json:32` |
| React | `^19.0.0` | `apps/web/package.json:35` |
| TypeScript | `^5.7.3` | 전체 tsconfig |

Next.js 15는 server action + RSC가 일반화된 버전. App Router(`apps/web/app/`)만 사용, pages router 없음.

### 3.2 데이터 계층

**PostgreSQL + Drizzle ORM**

- 이미지: `pgvector/pgvector:pg16` (`docker/docker-compose.yml:17`)
- 확장: `uuid-ossp`, `vector`, `pg_trgm`, `unaccent` (`docker/init-db/01-extensions.sql`)
- Drizzle ORM `^0.45.2`, drizzle-kit `^0.31.0`
- 마이그레이션 9개 (`0000` ~ `0008`, 총 681라인 SQL)
- 스키마 snapshot 9개 (`0000_snapshot.json` ~ `0008_snapshot.json`, 총 36,367라인 JSON)

**pgvector 사용 용도 (실제 코드):**

- `packages/db/schema/knowledge.ts:20-24`:
  ```ts
  const vector = customType<{ data: number[]; driverData: string }>({
    dataType: () => "vector(1536)",
    fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
    toDriver: (value: number[]) => `[${value.join(",")}]`
  });
  ```
  → `knowledge_claim.embedding` (OpenAI text-embedding-3-small 1536d)
- `packages/db/schema/case.ts:24-28`: 동일한 customType → `precedent_case.embedding` (TF-IDF+SVD 1536d, API 비용 $0)
- 인덱스: `idx_kc_embedding ON knowledge_claim USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)` (`0001_auth_and_search_indexes.sql:27`)

**pgvector 쿼리 패턴:** `packages/ai/ask.ts:74-84`가 `kc.embedding <=> [${values}]::vector`로 cosine distance 검색. `case-context.ts:141`도 동일 연산자.

**OpenSearch:** README.md·CURRENT_STATE.md 어디에도 OpenSearch 언급 없음. `packages/search/`는 **PostgreSQL 기반(FTS + pg_trgm + pgvector)**만 구현. 상위 메모(`MEMORY.md`의 "OpenSearch+Next.js+PG")는 과거 스프린트 시점 기록이지 현재 코드에는 없다. **Jarvis는 OpenSearch를 사용하지 않는다.**

**Redis:**
- `ioredis ^5.4.2` (web + db 패키지)
- 용도: OIDC 세션(`packages/auth/session.ts`: `jarvis:session:{id}` 키, TTL 8시간), Ask rate limiting(`apps/web/app/api/ask/route.ts:19-65`: `ratelimit:ask:{userId}`, 20 req/hour), embedding 캐시(`packages/ai/embed.ts:18-46`: `embed:{sha256}`, TTL 24시간), popular search aggregation

**잡 큐:** `pg-boss ^10.1.3` (`apps/worker/src/lib/boss.ts` + `apps/worker/src/index.ts`). 7 잡 타입: ingest, embed, compile, graphify-build, check-freshness, aggregate-popular, cleanup.

### 3.3 LLM 계층

**OpenAI 사용 위치 (실제 호출 지점 전체 나열):**

1. `packages/ai/embed.ts:34-44` — 쿼리·문서 임베딩 (`text-embedding-3-small`, 1536 dim). Redis SHA256 캐시 24시간.
2. `packages/ai/ask.ts:127-129` (모듈 싱글턴) + `ask.ts:311-320` — Ask AI 생성 (`gpt-4.1-mini` 기본, `process.env['ASK_AI_MODEL']`로 override). SSE 스트리밍 + usage 토큰 추적.
3. `packages/ai/tutor.ts:9-10` (모듈 싱글턴) + `tutor.ts:167-174` — HR 튜터 (같은 모델). Guide/Quiz/Simulation 모드별 온도 분기(quiz=0.3, else=0.5).
4. `apps/worker/src/jobs/embed.ts:8` + `embed.ts:20-26` — 문서 임베딩 배치 (`text-embedding-3-small`, 10개 단위 배치).
5. `packages/db/seed/dev.ts` — 시드용 (개발 환경).

**Anthropic 사용 위치 (실제 호출 지점):**

1. `apps/worker/src/jobs/graphify-build.ts:162` — Graphify subprocess 환경변수 `ANTHROPIC_API_KEY` 전달 (Graphify가 `claude-haiku-4-5-20251001` 호출). **코드 자체는 Anthropic SDK를 직접 import 하지 않음** — Python Graphify 내부에서만 사용.

**결론: Jarvis 코드베이스 내 LLM 직접 호출은 OpenAI만, Anthropic은 Graphify subprocess를 통해 간접적으로만.** `@anthropic-ai/sdk ^0.30.0`이 `packages/ai/package.json:17`에 의존성으로 남아있지만 현재 ts 파일 어디에서도 import되지 않음(grep 결과 없음) — 제거 가능한 dead dependency.

**프롬프트 매니지먼트:**
- 하드코딩. `ask.ts:243-274`의 `SYSTEM_PROMPT_BASE / SIMPLE_SUFFIX / EXPERT_SUFFIX` 상수.
- 튜터는 `tutor.ts:35-69`에 `TUTOR_GUIDE_PROMPT / TUTOR_QUIZ_PROMPT / TUTOR_SIM_PROMPT` 3종.
- 별도 프롬프트 템플릿 엔진·버저닝·A/B 시스템 없음.

**스트리밍:** OpenAI `stream: true` + `stream_options: { include_usage: true }` → `AsyncGenerator<SSEEvent>`로 yield. API 레이어에서 `text/event-stream`으로 변환(`apps/web/app/api/ask/route.ts:67-104`).

**토큰 추적:** `ask.ts:329` `totalTokens = prompt + completion` 합산 후 SSE `done` 이벤트로 클라이언트 전달. DB에 영구 저장은 없음 — **감사/과금 로그 부재**.

**캐싱:** embedding만 Redis 24시간. 생성 답변은 캐시하지 않음.

### 3.4 프론트엔드

- React 19 (`apps/web/package.json:35-36`)
- RSC 기본 + `"use client"` 명시 컴포넌트. layout.tsx / page.tsx는 server component 기본.
- **next-intl 4.9** 단일 로케일 `ko.json`. `apps/web/i18n/` 설정. 컴포넌트: `useTranslations`, 서버: `getTranslations`.
- **ko.json 현황:** 441줄, 305개 키, 13개 최상위 네임스페이스(Admin, Dashboard, Profile, Projects, Systems, Attendance, Ask, Common, Architecture, OutManage, AttendanceCalendar, Knowledge, System).
- UI 라이브러리: **shadcn/ui 스타일** 자체 구축 — `apps/web/components/ui/` 20개 파일(accordion, alert, badge, button, calendar, card, dialog, form, input, label, popover, scroll-area, select, separator, sheet, skeleton, table, tabs, textarea, tooltip). Radix UI 기반 패턴. `tailwind-merge`, `class-variance-authority`, `clsx` 사용.
- **아이콘:** `lucide-react ^0.468.0`.
- **에디터:** 별도 리치 에디터 없음. `apps/web/components/knowledge/PageEditor.tsx`는 `<Textarea>` 기반 + `react-markdown ^10.1.0` + `remark-gfm ^4.0.1`로 미리보기. 툴바는 bold/italic/code/link/image 삽입 정도(PageEditor.tsx:22-29 import).
- 폼: `react-hook-form ^7.54.2` + `@hookform/resolvers ^3.9.1`.
- 테이블: `@tanstack/react-table ^8.21.2`.
- 날짜: `date-fns ^3.6.0`.
- **Tailwind CSS 4.1.3** — Next 15와 PostCSS 호환. `apps/web/postcss.config.mjs`, `apps/web/styles/`.

### 3.5 인프라

**Docker compose:** `docker/docker-compose.yml` + `docker/docker-compose.dev.yml` override.

**서비스(프로덕션):**
- `jarvis-postgres` (pgvector/pgvector:pg16, secret file로 비밀번호)
- `jarvis-redis` (redis:7-alpine, `--appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru`)
- `jarvis-minio` (minio/minio:latest, root credentials from secrets)
- `jarvis-web` (Dockerfile.web, port internal only)
- `jarvis-worker` (Dockerfile.worker, pg-boss worker)
- `jarvis-nginx` (nginx:1.25-alpine, 80/443 expose, letsencrypt 볼륨 읽기)

**개발 오버라이드:** 호스트 포트 노출 (web:3010, postgres:5436, redis:6380, minio:9100/9101).

**Secrets:** `docker/secrets/` 파일 기반 — pg_password, minio_user, minio_password, session_secret, anthropic_api_key. `entrypoint.sh`가 이 파일을 env var로 주입.

**.env.example (개발):**
- `DATABASE_URL=postgresql://jarvis:jarvispass@localhost:5436/jarvis`
- `REDIS_URL=redis://localhost:6380`
- `MINIO_*` (localhost:9100, bucket `jarvis-files`)
- `OIDC_*` (개발: dev 계정 로그인, OIDC 불필요)
- `OPENAI_API_KEY`, `ASK_AI_MODEL=gpt-4.1-mini`
- `ANTHROPIC_API_KEY`, `GRAPHIFY_*` (BIN, MODEL=claude-haiku-4-5-20251001, TIMEOUT_MS=300000, MAX_FILE_COUNT=500, MAX_ARCHIVE_MB=100, AUTO_BUILD=false)

**CI/CD:** GitHub Actions 파일 없음 (CURRENT_STATE.md가 명시: "CI/CD: GitHub Actions workflow 필요"). 배포는 `scripts/start-prod.sh` 수동.

---

## 4. 현재 기능 인벤토리 (구현된 것만)

문서에 적혀 있어도 코드 미확인 시 제외. file:line 근거 포함.

### 4.1 인증 / 권한

**구현됨:**
- OIDC Authorization Code + PKCE (`packages/auth/oidc.ts`)
- Redis 세션 (8시간 TTL, `packages/auth/session.ts:4`)
- `sessionId` 쿠키, middleware로 모든 `(app)/` 라우트 보호(`apps/web/middleware.ts:16-23`)
- 개발 로그인 바이패스: `apps/web/app/api/auth/dev-login/` + `apps/web/lib/auth/dev-accounts.ts`
- RBAC 권한 상수(`packages/shared/constants/permissions.ts`) — 23개 permission 정의 (KNOWLEDGE_*, PROJECT_*, SYSTEM_*, ATTENDANCE_*, USER_*, AUDIT_*, ADMIN_ALL, FILES_WRITE, GRAPH_READ, GRAPH_BUILD, SYSTEM_ACCESS_SECRET)
- 역할 매핑 5종 (`ROLE_PERMISSIONS`): ADMIN / MANAGER / DEVELOPER / HR / VIEWER
- Sensitivity 4단계: PUBLIC / INTERNAL / RESTRICTED / SECRET_REF_ONLY
- Sensitivity 쿼리 필터 util:
  - `canAccessKnowledgeSensitivity` / `canAccessKnowledgeSensitivityByPermissions` / `buildKnowledgeSensitivitySqlFilter` (`packages/auth/rbac.ts:37-86`)
  - `canAccessGraphSnapshotSensitivity` / `buildGraphSnapshotSensitivitySqlFragment` (`rbac.ts:131-167`)
  - `canResolveSystemSecrets`, `canAccessSystemAccessEntry`, `canAccessSensitivity` (일반)
- `requirePermission` util + API guard `requireApiSession` (`apps/web/lib/server/api-auth.ts`, `page-auth.ts`)

**미구현:**
- 감사 로그 DB에 `audit_log` 테이블 있지만(`packages/db/schema/audit.ts`) 체계적으로 모든 mutation 기록하는 헬퍼 미비. `stale-check.ts:46`이 `page.stale` action만 기록.
- workspace isolation 코드는 있으나(모든 테이블에 `workspaceId`) 멀티테넌트 실전 검증 안 됨(CURRENT_STATE.md:616 "code-ready, not enforced").

### 4.2 위키 기능 (4-표면 지식 모델)

**구현됨:**
- `knowledge_page` 테이블이 4-표면 컬럼 보유: `surface`(canonical/directory/case/derived), `authority`(canonical/curated/generated/imported), `ownerTeam`, `audience`, `reviewCycleDays`, `domain`, `sourceOrigin`, `sourceType`, `sourceKey` (`packages/db/schema/knowledge.ts:57-70`)
- `knowledge_page_version` — MDX 콘텐츠 + frontmatter jsonb + changeNote + versionNumber
- `knowledge_claim` — 청크 단위 + embedding + verified 플래그
- `knowledge_page_owner`, `knowledge_page_tag` — PK 두 컬럼 컴파운드
- 라우트: `/knowledge/` (리스트) + `/knowledge/[pageId]/` (view + edit + history + review) + `/knowledge/new/` + 도메인 필터 서브라우트(`faq`, `glossary`, `hr`, `onboarding`, `tools`)
- 에디터: `KnowledgeMarkdown` 렌더러 + `PageEditor` (textarea + preview 탭 + bold/italic/code/link/image 삽입 버튼)
- 버전 diff: `VersionDiff.tsx` (`diff ^8.0.4` 사용)
- 리뷰 큐: admin `/review-queue/` + `review_request` 테이블
- **seed 데이터:** 95 canonical 문서 (ISU guidebook, `data/canonical/`), 31 directory entries, 74,342 TSVD999 사례 (CURRENT_STATE.md:114)
- Knowledge Debt Radar: `apps/web/components/knowledge/KnowledgeDebtRadar.tsx` + `app/actions/knowledge-debt.ts` (141줄) → overdue/warning/healthy 카운트, byTeam/byDomain 분류, overdueDays 정렬
- Drift Detection: `app/actions/drift-detection.ts` (207줄) → `missing_system` / `broken_link` / `version_gap` 3종 탐지, severity low/medium/high

**미구현:**
- WYSIWYG 리치 에디터 없음 (textarea 기반)
- 공동편집(Yjs/CRDT) 없음
- 이미지/첨부 직접 에디터 삽입 워크플로 미정
- 템플릿 라이브러리 없음
- 모듈별 간섭 없는 네임스페이스/스페이스 개념 미흡
- 페이지 간 링크 자동 역참조 미구현
- 태그 기반 브라우징 UI 빈약 (태그 테이블은 존재)

### 4.3 RAG / AI 기능

**구현됨:**
- **6-레인 라우터** (`packages/ai/router.ts`): text/graph/case/directory/action/tutor 6-lane + 가중치 기반 스코어링 + confidence 반환. LLM 호출 없음(순수 정규식).
- **askAI 파이프라인** (`packages/ai/ask.ts:344-446`): 라우트 결정 → 병렬 retrieval(text + graph + case + directory) → assembleContext → OpenAI generateAnswer → SSE.
- **TextClaims retrieval**(`ask.ts:47-122`): embedding + vector cosine + FTS rank 하이브리드(0.7/0.3 weight).
- **Case retrieval**(`case-context.ts`): embedding 유무 체크 → 있으면 vector 검색 + digest bonus 0.15 + company soft boost 0.15, 없으면 ILIKE 폴백. Sensitivity 필터 포함.
- **Directory retrieval**(`directory-context.ts`): 토큰화 + 불용어 제외 + ILIKE(name/nameKo/description) + name hit 비율 스코어.
- **Graph retrieval**(`graph-context.ts`, 343줄): keyword 추출 → snapshot 선택(explicit 또는 keyword match) → 노드 ILIKE → 1-hop neighbor → 재귀 CTE 경로 탐색(depth ≤ 5) → community 컨텍스트.
- **AnswerCard 4-소스 분류 UI** (`apps/web/components/ai/AnswerCard.tsx`): text/graph/case/directory 분리 섹션.
- **Simple/Expert 모드 토글** (`packages/ai/ask.ts:259-274`, `apps/web/components/ai/AskPanel.tsx:54`).
- **HR 튜터**: guide/quiz/simulation 모드(`tutor.ts`), 온보딩 토픽 8개(attendance/leave/hr-system/expense/welfare/eval/facility/it).
- **SSE 스트리밍**: `text/event-stream` + text/sources/done/error 4종 이벤트(`types.ts:69-75`).
- **Rate limiting**: 20 req/hour/user Redis 카운터(`apps/web/app/api/ask/route.ts:16-65`).
- **Popular questions**: `searchLog` 기반 Top 5 제안(`apps/web/app/(app)/ask/page.tsx:14-31`).
- **Scoped Ask**: `?snapshot=` 파라미터로 특정 graph snapshot 범위 한정(AskPanel:90).
- **Citation**: `[source:N]` 마커 자동 파싱 + ClaimBadge 팝오버.

**미구현 / 약점:**
- Lane 자동 분류가 순수 정규식 — 오분류 시 fallback LLM 분류 미구현 (`router.ts:169-183` 기본값 text-first).
- Re-ranking 고도화 없음(단순 가중치).
- Multi-turn 대화는 튜터에만 있고 일반 Ask는 single-turn.
- 답변 평가(thumbs up/down, correction) UI 없음 — 품질 개선 루프 부재.
- 프롬프트 A/B 테스트 도구 없음.
- Eval 하네스 없음 (RAG 품질 회귀 테스트 프레임워크 부재).

### 4.4 검색 기능

**구현됨 (`packages/search/pg-search.ts` 456줄):**
- FTS (`search_vector` + `websearch_to_tsquery`)
- pg_trgm similarity fallback (오타 강건성)
- Synonym expansion (`search_synonym` 테이블 + `synonym-resolver.ts`)
- Query parser (phrase/web/prefix 모드 감지, `query-parser.ts`)
- Facet counter (pageType / sensitivity 별 카운트)
- Hybrid ranker (FTS 0.6 + trgm 0.3 + freshness 0.1, `hybrid-ranker.ts`)
- Freshness score (< 7일 1.0, < 30일 0.8, < 90일 0.5, else 0.2)
- Fallback chain (FTS → trigram, `fallback-chain.ts`)
- Headline / highlighter (`highlighter.ts`)
- Admin explain view (롤 기반 가시성, `explain.ts`)
- Sensitivity 필터 SQL fragment 주입
- Suggest API: prefix + popular search 조합 (`suggest/route.ts`)
- Search log 기록: 쿼리, 필터, 결과 수, 클릭한 페이지, 클릭 rank, 응답 ms
- Popular search 주간 집계 (매 일요일 `aggregate-popular`)

**미구현:**
- Semantic 검색이 knowledge_page 본문에 대해서는 Ask 경로(knowledge_claim)로만 이뤄지고, 검색 UI(`/search`)는 FTS+trgm 위주. 검색 UI에서 semantic 랭킹 직접 노출 안 됨.
- Multi-index(프로젝트·시스템·근태 크로스 검색) 일관성 검증 부족.
- 검색 결과 bookmarking / recent searches UI 약함.

### 4.5 워커 / 백그라운드 작업

**구현됨:**
- `ingest` — MinIO 파일 다운로드 + PDF(pdfjs-dist), DOCX(mammoth), text/json 추출. archive (zip/tar/gz/bz2/7z/rar)는 placeholder 텍스트만 기록.
- `embed` — chunkText → batch 10개씩 OpenAI embedding → transaction swap.
- `compile` — 마크다운 strip 500자 summary → embed 잡 체인.
- `graphify-build` — 파일 카운트/크기 가드(MAX_FILE_COUNT=5000, MAX_ARCHIVE_MB=200) → `.graphifyignore` 주입 → 명시적 env allowlist subprocess → graph.json/html/GRAPH_REPORT.md/wiki/*.md 처리 → materializeGraph (graph_node/edge/community 삽입) → 실패 시 'error' 상태로 업데이트.
- `check-freshness` — 매일 09:00, `lastVerifiedAt + freshnessSlaDays < now()` 조건 페이지 찾아 `audit_log` 기록.
- `aggregate-popular` — 주 일요일 00:00.
- `cleanup` — 매월 1일 00:00, 로그/버전 정리.

**미구현:**
- 잡 실행 대시보드 UI 없음 (pg-boss 내부 테이블 수동 조회 필요).
- 잡 재시도 전략 세분화 미흡 (graphify-build throw 후 pg-boss 기본 재시도 의존).
- 워커 메트릭 export(Prometheus 등) 없음.

### 4.6 업무 시스템 CRUD 기능

- **Projects:** 리스트/생성/상세(탭: inquiries/staff/tasks/settings), 아카이브 버튼. `project`, `project_task`, `project_inquiry`, `project_staff` 4테이블.
- **Systems:** 리스트/생성/상세(탭: access/deploy/runbook/edit), SystemAccess 엔트리(secret ref). `system`, `system_access` 2테이블.
- **Attendance:** 캘린더 + 체크인 버튼 + 외근관리(OutManage 폼 + 시간 상세). `attendance`, `out_manage`, `out_manage_detail` 3테이블.
- **Admin:** Users(CRUD), Organizations(트리), Menus(순서/가시성 편집), Codes(마스터), Companies(CRUD), Audit(필터 + 페이지네이션), ReviewQueue, SearchAnalytics, Settings.
- **Profile:** ProfileInfo + QuickMenuEditor.
- **Dashboard:** 8개 위젯 조합 (StatCard + AttendanceSummary + MyTasks + ProjectStats + QuickLinks + RecentActivity + SearchTrends + StalePages).

**미구현:**
- 알림(in-app / email / slack) 없음 — 라우팅/정책 미정.
- 타 시스템 웹훅 없음 (발신).
- Bulk import/export UI 없음 (스크립트만 존재).

---

## 5. 데이터 모델 (Drizzle 스키마 상세)

### 5.1 전체 테이블 목록 (schema/*.ts 기반)

| 파일 | 테이블 | 줄수 |
|------|--------|------|
| `tenant.ts` | workspace, organization | 47 |
| `user.ts` | user, role, permission, user_role, role_permission | 96 |
| `company.ts` | company | 20 |
| `project.ts` | project, project_task, project_inquiry, project_staff | 93 |
| `system.ts` | system, system_access | 64 |
| `attendance.ts` | attendance, out_manage, out_manage_detail | 66 |
| `knowledge.ts` | knowledge_page, knowledge_page_version, knowledge_claim, knowledge_page_owner, knowledge_page_tag | 150 |
| `case.ts` | precedent_case, case_cluster | 202 |
| `directory.ts` | directory_entry | 90 |
| `graph.ts` | graph_snapshot, graph_node, graph_edge, graph_community | 161 |
| `search.ts` | search_log, search_synonym, popular_search | 46 |
| `audit.ts` | audit_log | 38 |
| `review.ts` | review_request | 22 |
| `file.ts` | raw_source, attachment | 46 |
| `menu.ts` | menu_item | 25 |
| `code.ts` | code_group, code_item | 40 |
| `index.ts` | (re-exports) | 16 |

**실제 테이블 총개수:** workspace(1) + organization(1) + user(1) + role(1) + permission(1) + user_role(1) + role_permission(1) + company(1) + project(1) + project_task(1) + project_inquiry(1) + project_staff(1) + system(1) + system_access(1) + attendance(1) + out_manage(1) + out_manage_detail(1) + knowledge_page(1) + knowledge_page_version(1) + knowledge_claim(1) + knowledge_page_owner(1) + knowledge_page_tag(1) + precedent_case(1) + case_cluster(1) + directory_entry(1) + graph_snapshot(1) + graph_node(1) + graph_edge(1) + graph_community(1) + search_log(1) + search_synonym(1) + popular_search(1) + audit_log(1) + review_request(1) + raw_source(1) + attachment(1) + menu_item(1) + code_group(1) + code_item(1) = **39 테이블** (CURRENT_STATE.md 카운트와 일치).

### 5.2 핵심 테이블 상세

**knowledge_page** (`schema/knowledge.ts:30-79`)

주요 컬럼:
- id (uuid PK), workspaceId (FK), pageType (varchar 50)
- title, slug (둘 다 varchar 500)
- summary (text)
- sensitivity varchar 30 default 'INTERNAL' notnull
- publishStatus varchar 30 default 'draft' notnull (draft/published)
- freshnessSlaDays int default 90 notnull
- lastVerifiedAt timestamp tz
- publishedAt timestamp tz
- createdBy FK user
- searchVector tsvector (GIN 인덱스)
- **surface** varchar 20 default 'canonical' notnull — 'canonical'|'directory'|'case'|'derived'
- **authority** varchar 20 default 'canonical' — 'canonical'|'curated'|'generated'|'imported'
- ownerTeam, audience, reviewCycleDays, domain, sourceOrigin, sourceType, sourceKey
- 인덱스: unique externalKey(workspaceId, sourceType, sourceKey) where sourceType not null; sourceOrigin composite index

**knowledge_claim** (`schema/knowledge.ts:100-115`)

- id, pageId(FK cascade), chunkIndex int default 0
- claimText text notnull
- sourceRefId uuid
- confidence numeric(3,2)
- **embedding vector(1536)** (pgvector custom type)
- verified boolean default false, verifiedBy FK user
- 인덱스: `idx_knowledge_claim_page ON (pageId)`, `idx_kc_embedding ON embedding USING ivfflat(vector_cosine_ops) lists=100`

**precedent_case** (`schema/case.ts:33-115`)

- workspaceId, **sourceKey** varchar 300 (unique per workspace)
- originalSeq, higherCategory/lowerCategory, appMenu, processType
- title notnull, symptom/cause/action text
- result (resolved/workaround/escalated/no_fix/info_only)
- requestCompany, managerTeam
- clusterId int, clusterLabel, isDigest boolean (군집 대표 여부), digestPageId FK knowledge_page
- severity (low/medium/high/critical)
- resolved, urgency boolean, workHours numeric
- sensitivity varchar 30 default 'INTERNAL' notnull
- **embedding vector(1536)** — TF-IDF+SVD (API 비용 $0)
- tags jsonb default []
- 인덱스 6개: workspace, cluster, category, company, digest, digest_page + unique source_key

**case_cluster** (`schema/case.ts:120-165`)

- workspaceId + numericClusterId (unique pair)
- label, description, caseCount
- digestCaseId / digestPageId
- topSymptoms/Actions/Categories jsonb string[]

**directory_entry** (`schema/directory.ts:23-80`)

- workspaceId, **entryType** varchar 30 (tool/form/contact/system_link/guide_link)
- name, nameKo, description
- url, category (hr/it/admin/welfare/facility/onboarding)
- ownerTeam, ownerContact, relatedPageSlug
- metadata jsonb (예: `{loginMethod, mobileAvailable, menuPath}`)
- sortOrder
- 인덱스: workspace_type, workspace_category, name
- **sensitivity 컬럼 없음** — `directory-context.ts:53-55` 주석에 "assumed public-internal" 설계 명시.

**graph_snapshot** (`schema/graph.ts:33-98`)

- workspaceId, rawSourceId (FK nullable)
- **scopeType pgEnum** — attachment/project/system/workspace
- scopeId uuid notnull (polymorphic)
- sensitivity varchar 30 default 'INTERNAL' notnull
- title
- graphJsonPath, graphHtmlPath (MinIO 키)
- nodeCount, edgeCount, communityCount, fileCount
- buildMode varchar 20 default 'standard' (standard/deep)
- **buildStatus pgEnum** — pending/running/done/error
- buildDurationMs, buildError text
- analysisMetadata jsonb `{godNodes, communityLabels, suggestedQuestions, tokenReduction}`
- 인덱스 3개: workspace_status, workspace, scope(workspaceId, scopeType, scopeId, buildStatus)

**graph_node / graph_edge / graph_community**

- node: snapshotId, nodeId(string 500), label, fileType, sourceFile, sourceLocation, communityId, metadata jsonb. unique(snapshotId, nodeId), community idx, label idx.
- edge: snapshotId, sourceNodeId, targetNodeId, relation, confidence(string 20), confidenceScore(string 10), sourceFile, weight(default '1.0'), metadata jsonb.
- community: snapshotId + communityId unique, label, nodeCount, cohesionScore, topNodes jsonb string[].

**audit_log** (`schema/audit.ts`)

- workspaceId, userId(nullable), action, resourceType, resourceId, ipAddress inet, userAgent, details jsonb, success boolean, errorMessage, searchVector tsvector

**search_log** (`schema/search.ts`)

- query text, filters jsonb, resultCount, clickedPageId, clickedRank, responseMs

### 5.3 특이점 및 패턴

1. **멀티테넌트 컬럼**: 대부분 테이블에 `workspaceId uuid references workspace.id`. 워크스페이스 수준 격리.
2. **Sensitivity 4단계**: knowledge_page, precedent_case, graph_snapshot, system, system_access에 `sensitivity varchar(30) default 'INTERNAL' notnull`. directory_entry는 미보유(의도적).
3. **pgvector 1536d**: knowledge_claim, precedent_case 두 곳만. 같은 vector customType 정의를 schema/knowledge.ts와 schema/case.ts 양쪽에 중복 — 통합 여지 있음.
4. **tsvector**: knowledge_page.searchVector, audit_log.searchVector — GIN 인덱스.
5. **JSONB 사용처**: tenant.settings, user.preferences, raw_source.metadata, knowledge_page_version.frontmatter, knowledge_claim(없음), precedent_case.tags, case_cluster.topSymptoms/Actions/Categories, directory_entry.metadata, graph_snapshot.analysisMetadata, graph_node/edge/community.metadata/topNodes, audit_log.details, search_log.filters.
6. **pgEnum**: graph_snapshot의 buildStatusEnum, graphScopeTypeEnum. sensitivity는 enum 대신 varchar(30) — 유연성 유지.
7. **상속**: knowledge_page → knowledge_page_version → knowledge_claim 3단 계층. digest_page_id로 precedent_case·case_cluster → knowledge_page 링크.
8. **raw_source / attachment**: 업로드 파일 추상화. `resource_type + resource_id` 폴리모픽 참조로 어떤 엔티티에든 첨부 가능.
9. **파티셔닝 없음**: 현재 전 테이블 단일 파티션. precedent_case 74,342행 수준.
10. **role_permission 테이블과 코드 상의 ROLE_PERMISSIONS 상수**: DB 매핑과 코드 상수가 이중 존재. seed로 동기화 예상.

### 5.4 마이그레이션 이력

| 번호 | 제목(추정) | 주요 변경 | 줄수 |
|------|-----------|---------|------|
| 0000 | nebulous_sharon_carter | 최초 스키마 (대부분 테이블) | 470 |
| 0001 | auth_and_search_indexes | sso_subject unique + search GIN + pgvector ivfflat | 36 |
| 0001 | lean_frog_thor | (중복 번호 존재 — 주의) | 14 |
| 0002 | salty_revanche | - | 46 |
| 0003 | nosy_aaron_stack | 미미 | 1 |
| 0004 | graphify_scope_and_upsert | graph scope/sensitivity | 15 |
| 0005 | productive_power_pack | case + directory + 4-surface 컬럼 | 90 |
| 0006 | stormy_scorpion | case_cluster unique index 재설정 + precedent_case source_key | 3 |
| 0007 | perfect_cable | 보조 인덱스 | 4 |
| 0008 | yellow_bloodaxe | knowledge_claim page_idx 등 | 2 |

**두 개의 0001**: `0001_auth_and_search_indexes.sql`과 `0001_lean_frog_thor.sql` 공존. 주석 있음 ("수동 편집 금지"). 과거 수정 흔적 — 향후 정리 필요 여지.

**Drift 감지 훅**: `.claude/settings.json:PostToolUse` → `node scripts/check-schema-drift.mjs --hook`. schema .ts 파일 편집 mtime이 `_journal.json` mtime보다 500ms 이상 앞서면 stderr 경고(`scripts/check-schema-drift.mjs:94-101`). **차단하지 않는 advisory 훅**.

---

## 6. LLM 사용 패턴 현황

### 6.1 호출 위치 요약 (파일:라인)

| 위치 | 목적 | 모델 | 특징 |
|------|------|------|------|
| `packages/ai/embed.ts:34-44` | 쿼리/문서 임베딩 | `text-embedding-3-small` (1536d) | Redis SHA256 캐시 24h |
| `packages/ai/ask.ts:311-331` | Ask 답변 생성 | `$ASK_AI_MODEL` ?? `gpt-4.1-mini` | SSE 스트리밍, max_tokens=1024, usage 포함 |
| `packages/ai/tutor.ts:167-185` | HR 튜터 | 동일 모델 | temperature 0.3(quiz)/0.5(other), max_tokens=1500 |
| `apps/worker/src/jobs/embed.ts:21-26` | 배치 문서 임베딩 | `text-embedding-3-small` | 10개 batch |
| `apps/worker/src/jobs/graphify-build.ts:157-164` | Graphify subprocess | `claude-haiku-4-5-20251001` (Anthropic) | 환경변수로 전달, allowlist |

### 6.2 프롬프트 패턴

**단일 system 프롬프트 문자열 상수**(ask.ts:243-274). 세그먼트:
1. 소개 ("You are Jarvis…")
2. 4종 source kind 설명(text/graph/case/directory)
3. Citation 규칙 5개(authority 순서 text > graph > case > directory, [source:N] 표기, 한국어 우선)
4. 모드 suffix(simple: 2-3 sentences → link → team contact / expert: 상세 + 증상-원인-조치-결과 구조)

**튜터 프롬프트**(`tutor.ts:35-69`): 3종(guide/quiz/simulation) 각 모드별 한국어 역할 지침.

**컨텍스트 포맷**: XML-like 커스텀(`<context><source idx="1" kind="text">...</source>...</context>`). `assembleContext`가 text/graph/case/directory를 한 idx 공간으로 통합(`ask.ts:191-238`).

### 6.3 부재한 것

- 프롬프트 버저닝 / 실험 관리 없음
- 시스템 프롬프트 외부화(파일, DB) 없음 — 모두 TS 상수
- Tool calling / function calling 사용 안 함
- Structured output(JSON mode, schema) 사용 안 함 — 출처 태그를 `[source:N]`으로 자연어 파싱
- Token usage DB 저장 / 집계 / 비용 대시보드 없음
- 프롬프트 eval 하네스 없음 (RAG 품질 회귀 테스트 부재)

---

## 7. 임베딩 & 검색 현황

### 7.1 pgvector 실제 사용

**두 개 테이블에만 존재**: `knowledge_claim.embedding` + `precedent_case.embedding`. 모두 1536d. 인덱스는 `knowledge_claim`에만 ivfflat(lists=100) 적용 — `precedent_case`에는 인덱스 없음(74,342행에서 순차 스캔 가능성).

### 7.2 임베딩 대상 및 청킹

- **knowledge_claim**: `apps/worker/src/jobs/embed.ts:69` `chunkText(mdxContent, 300, 50)` — 300 토큰 청크, 50 토큰 오버랩 추정(`lib/text-chunker.ts` 참조). `MAX_CHUNKS=500` 가드(약 150KB 텍스트). OpenAI text-embedding-3-small. 10개 배치.
- **precedent_case**: TF-IDF + TruncatedSVD 1536d 로컬 생성 (`scripts/generate-tfidf-embeddings.py`). 외부 API 호출 없음, 비용 $0.

### 7.3 OpenSearch 분담

**사용하지 않음.** 검색 전부 PostgreSQL 위(FTS + trgm + pgvector). `packages/search/adapter.ts`의 `SearchAdapter` 추상화로 추후 교체 여지만 남김.

### 7.4 하이브리드 검색

- **지식 검색 UI** (`packages/search/pg-search.ts`): FTS 0.6 + trgm 0.3 + freshness 0.1. synonym 확장. fallback chain. facet 병렬.
- **Ask retrieval** (`packages/ai/ask.ts:47-122`): vector sim 0.7 + FTS rank 0.3. 상위 TOP_K_VECTOR=10 중 TOP_K_FINAL=5 선별.
- **Case retrieval**: vector sim 0.7 + isDigest bonus 0.15 + company boost 0.15.

두 경로가 **다른 가중치**를 사용하고 공통 ranker 추상화가 없음 — 일관성/튜닝 관점에서 개선 여지.

---

## 8. Wiki 기능 현황

### 8.1 에디터

`apps/web/components/knowledge/PageEditor.tsx` — **Textarea 기반 + 미리보기 탭**. 툴바에 bold/italic/code/link/image 삽입 버튼. `react-markdown` + `remark-gfm`로 렌더링. WYSIWYG 아님.

### 8.2 렌더러

`apps/web/components/knowledge/KnowledgeMarkdown.tsx` — react-markdown + remark-gfm 기반 뷰어.

### 8.3 버전 관리

- `knowledge_page_version` 테이블 (MDX + frontmatter + changeNote + author + versionNumber)
- VersionHistory.tsx (리스트)
- VersionDiff.tsx (`diff ^8.0.4` 사용 두 버전 비교)

### 8.4 검색

FTS + pg_trgm + synonym 기반(§7.4). Ask 경로의 semantic 검색은 knowledge_claim 기준이고, /search UI는 knowledge_page FTS가 1차.

### 8.5 AI 연동

- 페이지 작성 시 embed 잡 자동 트리거(compile → embed 체인).
- 문서 본문의 `[system:...]` 류 참조를 drift-detection이 스캔.
- 튜터가 페이지 claim을 참조.

### 8.6 대표 seed 데이터

- ISU 가이드북 95문서(`data/canonical/` + `data/guidebook/isu-guidebook-full.md` 3,732줄 원본).
- canonicalize-guidebook.ts + seed-canonical.ts + build-guidebook-graph.ts 파이프라인.

---

## 9. 하네스 / 에이전트 구성

### 9.1 3인 에이전트

`.claude/agents/`에 아래 3개 정의:

- **jarvis-planner** (`jarvis-planner.md`, 126줄) — 영향도 체크리스트 기반 계획. DB/Validation/권한/AI/서버액션/UI/i18n/테스트/워커 9계층 강제 점검. RBAC/sensitivity를 명시적으로 결정 의무. `model: opus`.
- **jarvis-builder** (`jarvis-builder.md`, 103줄) — 의존성 순서(스키마→validation→권한→packages→lib→actions→page→_components→ko.json→worker→tests)로 구현. 한국어 하드코딩 금지, ko.json 경유. `model: opus`.
- **jarvis-integrator** (`jarvis-integrator.md`, 141줄) — 경계면 교차 비교. type-check/lint/test 자동화 선 실행, shape·i18n·권한·sensitivity 교차 검증. 수정 직접 안 함(빌더에 되돌림). `model: opus`.

### 9.2 4개 스킬

`.claude/skills/`:
- **jarvis-feature/SKILL.md** — 3인 팀 오케스트레이터. TeamCreate → Phase 1 명료화 → Phase 2 계획 → Phase 3 빌드 → Phase 4 검증(2회 반복 한도) → Phase 5 보고.
- **jarvis-architecture/SKILL.md** — 모노레포·스택·모듈 경계 요약 참조.
- **jarvis-db-patterns/SKILL.md** — Drizzle/RBAC/sensitivity/Zod 패턴.
- **jarvis-i18n/SKILL.md** — ko.json 키 추가/검증 규칙.

### 9.3 훅

`.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "node scripts/check-schema-drift.mjs --hook" }]
    }]
  }
}
```
schema ts 파일 편집 후 migration 재생성 누락 시 stderr 경고 (차단 없음).

### 9.4 Codex와의 공유

`AGENTS.md` 파일이 루트에 있음. Codex CLI도 같은 원칙 따름. Codex는 훅이 없으므로 세션 말미에 `node scripts/check-schema-drift.mjs` 수동 실행 권장(AGENTS.md:180-185).

### 9.5 Graphify 연동 상태 (메모리 참조)

`MEMORY.md`의 "Graphify Integration State — 이중 운영 확정, Ask AI 라우팅 설계, 외부 레포 역할 분리, 파이프라인 Critical 수정 필요" 라는 기록과 일치:

- **Jarvis 내부의 graphify-build 워커**: Graphify를 subprocess로 실행 (`apps/worker/src/jobs/graphify-build.ts`).
- **Python graphify 자체**: 사용자 글로벌 스킬(`~/.claude/skills/graphify/`)로 별도 관리. 코드 자체는 외부.
- **역할 분리**: Jarvis는 “graphify를 호출한 결과를 DB에 materialize하는 쪽”. graphify는 외부 유틸. 두 프로젝트는 캡슐화된 subprocess 인터페이스로 분리.
- **그래프 검색 통합**: `packages/ai/graph-context.ts`가 graph_snapshot/node/edge/community DB 테이블에 직접 쿼리. GraphSourceRef를 SourceRef 유니온에 포함시켜 AnswerCard에 한 섹션으로 표시.
- **SHA256 캐시**: graphify 내부 기능(Jarvis 외부).

---

## 10. 식별된 갭 (⭐⭐⭐⭐⭐ — 이번 통합의 핵심 판단 근거)

### 10.1 사내 위키로서 부족한 점

| 영역 | 현재 | 부족/위험 |
|------|------|----------|
| 에디터 | textarea + preview | **WYSIWYG/리치 에디터 부재**. 복잡한 표·수식·임베드 빈약. (llm_wiki/mindvault/qmd 같은 프로젝트가 에디터 경험 풍부하면 큰 gap) |
| 첨부/이미지 | raw_source 통한 업로드 후 URL 삽입 | **에디터 안 drag-drop 첨부** 없음. 클립보드 붙여넣기 없음. |
| 공동편집 | 없음 | 동시 편집 경험 없음 — 엔터프라이즈 위키에서 생산성 저해 |
| 템플릿 | 없음 | 새 페이지 생성 시 빈 페이지부터. 부서/유형별 템플릿 라이브러리 필요 |
| 백링크/역참조 | 없음 | 페이지 A에서 B를 참조하면 B에서 A를 역참조로 자동 노출 — 지식 망 형성에 필수 |
| 즐겨찾기/북마크 | 없음 | 퀵메뉴는 프로필에 있지만 지식 페이지 개인 북마크 없음 |
| 토론/댓글 | 없음 | 리뷰 큐는 있지만 페이지 내 댓글/스레드 없음 |
| 태그 브라우징 | 태그 테이블 있음 | UI 빈약 — 태그 클라우드/페이셋 탐색 미비 |
| 스페이스/폴더 | 없음 | 4-표면 모델만 있고 부서·제품별 네임스페이스 없음 |
| **정본/디렉터리/사례/파생 외 타 시스템 통합** | 없음 | Notion/Confluence/SharePoint 등 외부 위키 양방향 연동 없음 |
| 페이지 분석 | 없음 | 조회수/인기도/유용한 섹션 분석 없음 |

### 10.2 RAG 포털로서 부족한 점

| 영역 | 현재 | 부족/위험 |
|------|------|----------|
| 평가 루프 | 없음 | 답변 upvote/downvote, correction UI 없음. 품질 개선 사이클 부재 |
| eval 하네스 | 없음 | 질문-정답-정책 세트로 정기 회귀 평가 프레임워크 없음 |
| 프롬프트 관리 | 하드코딩 상수 | 외부화, 버저닝, 실험 관리 없음 |
| Multi-turn 대화 | 튜터만 | 일반 Ask single-turn. 후속 질문이 독립 맥락 |
| Citation 고도화 | `[source:N]` 문자열 | 답변 내 인용 → 원문 하이라이팅/섹션 점프 부재. PDF 페이지 점프 없음 |
| 답변 검증 | 없음 | 생성 답변이 출처와 모순되는지 기계 검증 없음(self-consistency, entailment) |
| 토큰 추적 | SSE done에 총합만 | DB 누적·사용자/워크스페이스별 비용 대시보드 없음 |
| 캐싱 | 임베딩만 | 생성 캐시 없음. 같은 질문 반복 시 LLM 재호출 |
| Tool calling | 없음 | OpenAI function calling 미사용. 구조화 출력 없음. DB 조회 액션 실행 AI 없음 |
| 프롬프트 A/B | 없음 | 실험 인프라 없음 |
| 라우터 정확도 | 정규식 가중치 | 오분류 사례 대응 없음. 학습 데이터 기반 개선 없음 |
| **개인화** | workspace 단위 | 사용자 조직/직무 기반 컨텍스트 가중치 없음(회사 부스트는 있음) |
| 오프라인 활용 | 없음 | 질문 시점 외 문서 미리보기/summary 자동 생성 없음 |

### 10.3 UX/UI 부족한 점

| 영역 | 현재 | 부족/위험 |
|------|------|----------|
| 디자인 시스템 | shadcn 클론 + Tailwind | 명시적 재설계 예정(`AGENTS.md:15`) — 현재 UI는 placeholder 수준 |
| 접근성 | Radix 기반이라 일부 커버 | 키보드 네비게이션·스크린리더 전사 검증 안 됨 |
| 다크모드 | 미지원(추정) | ko.json에 dark-mode 키 없음 |
| 온보딩 UI | 튜터 있음 | 첫 로그인 튜토리얼·투어 없음 |
| 모바일 | 없음 | Tailwind responsive 일부 있어도 모바일 전용 레이아웃 검증 없음 |
| 알림 센터 | 없음 | 리뷰 요청, 드리프트 탐지, stale 문서 알림 연결 안 됨 |
| 검색 UX | 기본 | 최근 검색, 저장한 검색, 추천 검색 히스토리 UI 빈약 |
| 명령 팔레트 | 없음 | Cmd+K 스타일 전역 네비 없음 |

### 10.4 데이터 파이프라인 부족한 점

| 영역 | 현재 | 부족/위험 |
|------|------|----------|
| 증분 재임베딩 | 페이지 전체 재생성 | 청크 단위 diff 기반 증분 없음 — 큰 페이지 수정 시 비용 낭비 |
| 멀티모달 | 없음 | 이미지/PDF 이미지 OCR, 스크린샷 OCR 파이프라인 없음 (pdfjs-dist는 텍스트만) |
| 외부 데이터 커넥터 | 없음 | Notion/Confluence/Google Drive/SharePoint 등 싱크 없음 |
| 스키마 변환 | 수동 script | SQL dump → jsonl → import 모두 Python/ts 스크립트 (`scripts/`에 다수) — 자동화된 watcher 없음 |
| 중복 탐지 | 없음 | 유사 문서 자동 병합/제안 없음 |
| graph materialization | graphify만 | 문서 간 관계 그래프(자동 백링크 기반) 없음 |
| 사례 리버스 임베딩 | TF-IDF 로컬만 | 품질 상한 낮음. OpenAI 임베딩으로 업그레이드 시 약 $2-3/월(DATA_REFRESH_GUIDE.md 언급) — 미적용 |

### 10.5 운영 / 관측 부족한 점

| 영역 | 현재 | 부족/위험 |
|------|------|----------|
| CI/CD | GitHub Actions 파일 없음 | 수동 `start-prod.sh`. 자동화 배포 없음 |
| APM/Tracing | 없음 | request ID middleware 없음, tracing 없음 |
| 메트릭 export | 없음 | pg-boss queue, search latency, LLM token cost 메트릭 export 없음 |
| 에러 수집 | 없음 | Sentry 등 미연동 |
| 로그 집계 | console.* | 구조화 로거(pino/winston) 미사용 |
| Audit 완전성 | action 단발 | 모든 mutation 자동 audit 인터셉터 없음 |
| 검색 relevance 회귀 | 없음 | 주기적 품질 체크 자동화 없음 |
| 비용 모니터링 | 없음 | OpenAI 비용 추적 없음 |
| 사용자 행동 분석 | search_log, popular_search | 페이지 뷰/체류/클릭 전반 추적 없음(Posthog 등 없음) |
| 테스트 커버리지 | 46 unit + 11 e2e | 카테고리 불균일. API 통합·RBAC 시나리오 테스트 빈약(CURRENT_STATE.md:474-479 자체 인정) |

---

## 11. 문서화 상태

### 11.1 현역 문서

- `README.md` (670줄) — 사용자/기여자 대상 전체 가이드. 최신(2026-04-14 재작성).
- `CLAUDE.md` (40줄) — Claude Code 세션 시작 시 자동 로드. 하네스 요약 + 변경 이력.
- `AGENTS.md` (195줄) — Codex + Claude 공용 최상위 지시문. 개발 명령어 + 3인 팀 원칙 + 자주 혼동되는 점.
- `docs/CURRENT_STATE.md` (620줄) — 단일 진실 원천(single source of truth, `git log` 1cd144d 커밋에서 명시). Phase 0~6 완료 상태.
- `docs/DATA_REFRESH_GUIDE.md` (301줄) — TSVD999 월 1회, 가이드북 수시, EHR 분기 1회 최신화 SOP.
- `docs/plan/2026-04-13-jarvis-next.md` — **STALE 표시**(첫 줄 경고). Phase 계획 기록 보존용.

### 11.2 아카이브

- `docs/archive/` — graphify-integration.md, analysis/2026-04-13-weekend-review.md, superpowers/plans/ 17개 플랜(2026-04-07 ~ 04-10), specs/ 2개.

### 11.3 .claude 하위

- `.claude/agents/` 3개 (planner/builder/integrator)
- `.claude/skills/` 4개 (jarvis-feature/architecture/db-patterns/i18n)
- `.claude/settings.json` — PostToolUse 훅 1개

### 11.4 문서와 코드 일치도

**높음:** README/CURRENT_STATE/AGENTS가 서로 모순 없음. CURRENT_STATE가 "single source of truth"로 최근 재정비(git 커밋 `1cd144d`).

**일부 표현 차이:** README는 "6개 검색 레인", AGENTS는 "RAG AI 포털 + 사내 업무 시스템", 모두 같은 코드를 가리키지만 초점 조금 다름. 기능 목록은 거의 동일.

**과거 계획 제거:** `docs/plan/2026-04-13-jarvis-next.md`는 자체적으로 STALE 경고(첫 줄). 과거 계획을 아카이브로 분리하고 최신만 유지.

---

## 12. 최근 커밋 트렌드 (git log --oneline -30)

최근 30 커밋 요약:

```
d4c159b docs: clean up stale docs, add data refresh guide, archive old plans
1cd144d docs: rewrite README + create CURRENT_STATE.md for single source of truth
c0d137d fix: second-pass audit — 8 issues (2 HIGH, 4 MEDIUM, 2 LOW)
28a5f78 fix: address 14 code review findings (CRITICAL + HIGH + MEDIUM)
3837aca feat(phase-6): company context boost, knowledge debt radar, simple/expert UI, HR tutor, drift detection
282b20d feat: guidebook seed + directory entries + case TF-IDF embeddings
1fa5f0e feat(jarvis-next): 4-surface knowledge model, 6-lane Ask AI router, TSVD999 case pipeline
60ec23a fix(ask): show error state when first query fails (#2)
e24727a fix(architecture): push sensitivity filter to DB level in BuildLifecycleSection; remove unused imports
e03d9b4 fix(ai): add permissions to graph-context integration tests
9b77cba feat(graphify): Trust & Scope — graph-aware Ask + architecture lifecycle UI
38ce669 fix: remove duplicate 0005 migration, push sensitivity filter to DB layer, preserve graph context for broad queries
1ee7ce3 fix(worker): fix test suite for pre-push gate
ce95caa fix(graphify): address codex P1/P2 findings from Tasks 12-18 review
e0a122b chore(worker): add test script to surface vitest suites in pnpm test
95f9b93 refactor(ai): use PERMISSIONS constants instead of raw string literals
4d703b7 refactor(ai): replace raw SQL sensitivity fragment with typed Drizzle notInArray
fc2e1ec feat(graphify): architecture lifecycle UI + scoped ask E2E (Tasks 12-18)
3289629 feat(ai): propagate permissions through graph context for sensitivity filtering
e80cbae feat(ui): gate architecture page with graph:read and filter by sensitivity
5b02f00 feat(api): gate graphify build endpoint with graph:build
f8f04db feat(api): gate graph fetch endpoint with graph:read + snapshot sensitivity
7f256dc feat(worker): propagate attachment lineage into graph_snapshot and knowledge imports
fe0a4ce feat(ask-ui): render graph source variant in SourceRefCard + ClaimBadge
0ff7388 feat(worker): add lineage resolver for graph_snapshot scope + sensitivity
7c507b2 feat(ask): wire searchParams + scope badge through AskPage→AskPanel
674d629 fix: address codex review findings (permissions, migration, keyword guard)
9546b26 feat(db): add graph_snapshot.sensitivity column (default INTERNAL)
394407f feat(auth): add graph snapshot sensitivity predicate and SQL fragment
6194995 feat(worker): upsert knowledge pages by sourceType/sourceKey on rebuild
```

### 12.1 패턴

1. **Phase 6 완료 후 정리 모드**: 최근 3개 커밋이 `docs:`, `fix:`(8 issues, 14 findings) — 기능 추가보다 안정화/리뷰 수정.
2. **Phase 전환 순서 명확**: `1fa5f0e feat(jarvis-next): 4-surface … 6-lane … TSVD999` → `282b20d feat: guidebook seed + directory + case TF-IDF` → `3837aca feat(phase-6): company boost + knowledge debt + simple/expert + HR tutor + drift`.
3. **Graphify Trust & Scope** 중심 보안 강화: sensitivity 필터 DB 레벨 이동, graph permission gating (API + UI 양쪽), scope lineage 전파. 감사 대응 마무리 느낌.
4. **코드 리뷰 기반 refactor**: `95f9b93 refactor: PERMISSIONS 상수 치환`, `4d703b7 refactor: raw SQL → Drizzle notInArray`, `ce95caa fix: codex P1/P2 findings` — 정적 품질 지표 정리.
5. **다음 관심사 힌트**: CURRENT_STATE.md 마지막 섹션 "Short Term (1-2 weeks)"이 Test Coverage / CI/CD / Observability를 우선. 코드 커밋과 일치.

### 12.2 Phase-6 이후 다음은?

메모리(`MEMORY.md`)에 "Phase-6 완료" 명시. CURRENT_STATE.md는 다음 후보로:
- 테스트 확대 (API 통합, 권한 시나리오, 검색 relevance 회귀)
- CI/CD (GitHub Actions)
- Observability (request id, queue metrics, APM)
- 검색 튜닝, Graphify 개선, UI 피드백 루프

**현재 세션의 "5개 레퍼런스 프로젝트 아이디어 통합" 요청은 Phase 7 진입 시그널**로 해석 가능. 추정되는 우선순위는:
1. llm_wiki / mindvault / qmd에서 위키 에디터·기능 확장 (§10.1 갭)
2. graphify에서 코드 분석 파이프라인 강화 (이미 ‘이중 운영’ 확정이지만 MCP 쿼리 엔진 등 연동 여지)
3. llm-wiki-agent에서 문서 자동화·체계화 에이전트 (§10.4 데이터 파이프라인)

---

## 13. 제약조건

### 13.1 스케일

- **5000명 사용자 규모** 타깃 (`AGENTS.md:9`).
- 현재 데이터: 95 canonical, 31 directory, 74,342 cases, 562 clusters.
- DB 크기 목표 10GB / 1주 데이터 (`CURRENT_STATE.md:465`).

### 13.2 스프린트 속도

- **1주 단위 스프린트** (`AGENTS.md:9` "1주 스프린트 베이스라인").
- 디자인 재구성 대기 중이므로 UI 완성도 낮음을 감수 (`AGENTS.md:15`).
- 하네스는 **경량 3인** (planner/builder/integrator). 4인 이상 확장 금지(`jarvis-feature/SKILL.md:228`).

### 13.3 강제 규율

- **Drizzle 스키마 drift 훅(advisory)** — 차단은 아니나 세션 중 경고(`settings.json`).
- **RBAC + sensitivity 필수** — 계획 단계에서 명시 결정, 검증자가 누락 탐지 시 P0(`jarvis-integrator.md:36`).
- **한국어 ko.json** — 하드코딩 금지, 305개 키 관리(`apps/web/messages/ko.json`).
- **패턴 따르기** — 기존 유사 페이지·액션을 반드시 먼저 읽고 구조 재사용(`jarvis-builder.md:20`).
- **multi-tenant workspaceId 필터** — 모든 쿼리 필수(`AGENTS.md:113`).
- **개발 경계**:
  - `apps/web/lib/` = 웹 전용
  - `packages/*` = web + worker 공유
  - `server action` = form/RSC mutation
  - `route.ts` = 외부 API
  - `apps/web/components/` = 전역
  - `apps/web/app/(app)/**/_components/` = 페이지 전용

---

## 14. 통합 시 고려해야 할 것

### 14.1 스키마 추가 비용

- 현재 39테이블, 9개 마이그레이션. 신규 테이블 추가는 비파괴적 ALTER보다는 새 파일 + `pnpm db:generate`.
- 두 개 0001 마이그레이션 이미 존재 — 파일명 충돌 주의.
- 민감 컬럼(`sensitivity`)이 모든 도메인 데이터에 적용되는 관행 존중 필요. 새 엔티티도 sensitivity 컬럼 보유 + RBAC 필터 SQL fragment 헬퍼 추가.
- pgvector 1536d custom type이 knowledge + case 양쪽 schema 파일에 중복 정의 — 신규 벡터 컬럼 추가 시 공통 모듈로 통합 기회.
- drift 훅 advisory라도 schema 수정 후 `pnpm db:generate` 필수.

### 14.2 i18n 부담

- 305개 키, 13개 최상위 네임스페이스. 새 기능마다 해당 네임스페이스에 키 추가. camelCase key + `{변수}` 보간.
- **이전 세션에서 보간 변수 불일치 버그 반복 발생** — integrator 체크리스트에서 교차 검증 필수.
- ko 단일 로케일. 영어 대응 필요 시 en.json 추가 + next-intl 설정 수정 필요.
- 번역은 "UI 파일 완성 후 마지막에 한 번에 추가" 순서 관례(`AGENTS.md:72`).

### 14.3 번들 사이즈 영향

- Next 15 + React 19 + RSC 최적화. client components 최소화 권장.
- 에디터 업그레이드 시 TipTap/ProseMirror/Slate 등 client-only 큰 의존성 주의.
- lucide-react는 tree-shakable이나 대량 import 주의.
- react-markdown + remark-gfm 이미 사용 중.

### 14.4 하네스/훅 정합성

- 새 패턴 도입은 planner 승인 하에. Builder 단독 새 패턴 금지(`jarvis-builder.md:21`).
- Integrator 자동화 명령: `pnpm --filter @jarvis/web type-check | lint | test`, `pnpm test`, `node scripts/check-schema-drift.mjs`.
- 테스트 파일은 기존 파일 옆(`foo.ts` → `foo.test.ts`).
- 하드코딩 금지 원칙은 문자열 뿐 아니라 권한 문자열(`'knowledge:update'`)도 포함 — 반드시 `PERMISSIONS.KNOWLEDGE_UPDATE` 사용(최근 커밋 `95f9b93 refactor`가 이 규칙 강화).

### 14.5 운영 이슈

- CI/CD 없음 → PR 검증이 수동. Integrator 역할이 더 큼.
- 관측/로그 부실 → 새 기능 도입 시 구조화 로깅 동시 도입 검토 권장.
- Graphify subprocess는 외부 바이너리 의존. 환경에 설치돼 있어야 함. Docker 이미지에 Graphify 포함 여부 확인 필요.
- 개발자 로컬 환경 비용(Docker 4서비스 + Node 22 + pnpm 10)이 이미 상당함 — 신규 서비스 추가 시 DX 검토.

### 14.6 통합 우선순위 판단 힌트

§10 갭 분석을 참고하면 **높은 우선순위 통합 후보**는:
1. **에디터 경험** (§10.1 가장 크고 눈에 띄는 gap). llm_wiki/mindvault/qmd가 리치 에디터 제공 시 1순위.
2. **평가/피드백 루프** (§10.2). 운영 품질의 구조적 문제.
3. **외부 데이터 커넥터** (§10.4). Notion/Confluence 등 싱크 — 5000명 규모에서 큼.
4. **관측/메트릭** (§10.5). Phase-6 이후 CURRENT_STATE.md도 언급.
5. **graphify 고도화** (이미 이중 운영). MCP 쿼리, 증분 빌드, 캐시 정책.

---

## 15. 요약 체크리스트 (AS-IS 빠른 재확인)

- [x] 모노레포: apps/web + apps/worker + packages/{ai,auth,db,search,secret,shared}
- [x] Next 15 + React 19 + Drizzle 0.45 + Tailwind 4 + next-intl 4
- [x] PostgreSQL 16 + pgvector + pg_trgm + unaccent
- [x] Redis + pg-boss 워커
- [x] MinIO 스토리지
- [x] OIDC SSO + Redis 세션 + RBAC 23권한 + Sensitivity 4단계
- [x] 39 Drizzle 테이블 + 9개 마이그레이션
- [x] knowledge_claim/precedent_case pgvector 1536d
- [x] 4-표면 지식 모델 컬럼 (surface/authority/owner_team/audience/review_cycle_days/domain/source_origin)
- [x] 95 canonical + 74,342 cases (TF-IDF) + 562 clusters + 31 directory
- [x] 6-레인 라우터 (정규식, LLM 없음)
- [x] Ask = OpenAI gpt-4.1-mini + text-embedding-3-small (+ SSE + Rate limit 20/h)
- [x] HR 튜터 (guide/quiz/simulation × 8 onboarding topics)
- [x] Knowledge Debt Radar + Drift Detection
- [x] AnswerCard 4-소스 분류 + Simple/Expert 모드
- [x] 하이브리드 검색 (FTS 0.6 + trgm 0.3 + freshness 0.1)
- [x] 7 pg-boss 잡 + 3 스케줄
- [x] Graphify subprocess 통합 (scope/lineage/sensitivity 전파 완료)
- [x] 3인 에이전트 하네스 + 4 스킬 + 1 훅
- [x] 46 unit + 11 e2e 테스트 (카테고리 편중)
- [x] 305 i18n 키 / 13 namespace / ko 단일 로케일
- [x] Docker compose 프로덕션/개발 분리
- [x] Phase 0~6 완료, Phase 7은 테스트 확대 + CI/CD + 관측 방향 예상

## 부록: 주요 파일 인덱스 (절대 경로)

- 최상위 설정:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\package.json`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\turbo.json`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\pnpm-workspace.yaml`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.env.example`
- 문서:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\README.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\CLAUDE.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\AGENTS.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\docs\CURRENT_STATE.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\docs\DATA_REFRESH_GUIDE.md`
- 스키마:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\knowledge.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\case.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\directory.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\graph.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\user.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\db\schema\tenant.ts`
- AI:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\router.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\ask.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\embed.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\case-context.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\directory-context.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\graph-context.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\tutor.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\ai\types.ts`
- Auth / RBAC:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\auth\rbac.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\auth\session.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\shared\constants\permissions.ts`
- 검색:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\search\pg-search.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\search\hybrid-ranker.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\packages\search\fallback-chain.ts`
- 워커:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\index.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\jobs\ingest.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\jobs\embed.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\jobs\compile.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\jobs\graphify-build.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\worker\src\jobs\stale-check.ts`
- 웹:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\app\api\ask\route.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\app\(app)\ask\page.tsx`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\app\actions\knowledge-debt.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\app\actions\drift-detection.ts`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\components\ai\AskPanel.tsx`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\components\ai\AnswerCard.tsx`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\messages\ko.json`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\apps\web\middleware.ts`
- 하네스:
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\agents\jarvis-planner.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\agents\jarvis-builder.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\agents\jarvis-integrator.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\skills\jarvis-feature\SKILL.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\skills\jarvis-architecture\SKILL.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\skills\jarvis-db-patterns\SKILL.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\skills\jarvis-i18n\SKILL.md`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\.claude\settings.json`
  - `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli\scripts\check-schema-drift.mjs`
