---
name: jarvis-architecture
description: Jarvis(사내 업무 시스템 + LLM 컴파일 위키)의 모노레포 구조·기술 스택·모듈 경계·핵심 파이프라인(page-first retrieval, 6-lane router, wiki-fs SSoT)을 정리한 아키텍처 레퍼런스. Jarvis 프로젝트에서 기능을 추가·수정하거나, 어느 패키지·어느 라우트에 코드를 넣을지 결정하거나, Ask AI/위키/권한/워커 잡 맥락이 필요할 때 반드시 이 스킬을 먼저 로드하라. jarvis-planner, jarvis-builder, jarvis-integrator 모두 진입점으로 사용한다. "구조 알려줘", "어디에 넣지", "아키텍처 맥락" 같은 표현에서도 트리거된다.
---

# Jarvis Architecture Reference

Jarvis는 사내 업무 시스템(근태·프로젝트·공지·추가개발 등) + **Karpathy 방식 LLM 컴파일 위키** + Ask AI(RAG 아님, page-first)를 하나의 TypeScript 모노레포로 통합한 사내 포털이다. 이 문서는 "어느 파일이 어느 책임을 지는가"를 빠르게 파악하기 위한 레퍼런스.

## 모노레포 레이아웃

```
jarvis/
├─ apps/
│  ├─ web/          # Next.js 15 App Router (port 3010)
│  │  ├─ app/
│  │  │  ├─ (app)/       # 인증 필요 라우트 그룹
│  │  │  ├─ (auth)/      # 로그인 등 공개 라우트
│  │  │  ├─ actions/     # 도메인 횡단 server action (공유)
│  │  │  ├─ api/         # REST endpoint (route.ts)
│  │  │  ├─ middleware.ts
│  │  │  └─ forbidden.tsx
│  │  ├─ components/     # 전역 공통 UI
│  │  ├─ lib/            # 웹 전용 서버 헬퍼·쿼리·auth 브리지
│  │  ├─ messages/       # next-intl ko.json (단일 로케일)
│  │  ├─ i18n/
│  │  └─ e2e/            # Playwright
│  └─ worker/            # pg-boss 워커 (독립 프로세스)
│     └─ src/jobs/       # ingest/, embed, compile, wiki-*, stale-check, ...
├─ packages/             # **8개** (web + worker 공유)
│  ├─ ai/                # Ask AI 파이프라인 (router, page-first, tutor, 6 contexts)
│  ├─ auth/              # 세션, RBAC, sensitivity 헬퍼
│  ├─ db/                # Drizzle schema (31 파일, 52 테이블) + migrations + seed
│  ├─ search/            # 하이브리드 검색 어댑터 (FTS/trigram/RRF), precedent 독립 검색
│  ├─ secret/            # 비밀번호 직접 저장 대신 SecretRef
│  ├─ shared/            # PERMISSIONS 상수, Zod validation, 공통 타입
│  ├─ wiki-fs/           # 디스크 I/O + Git 커밋 (**SSoT**). reader/writer/git/frontmatter/wikilink/worktree
│  └─ wiki-agent/        # LLM prompt builder / parser (stateless). ingest two-step CoT용
├─ docker/               # compose + Dockerfiles + cli-proxy 게이트웨이
├─ docs/                 # plan/, spec/, adr/, _archive/
└─ scripts/              # check-schema-drift, wiki-check, audit-rsc, eval-budget-test
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 모노레포 | pnpm workspace + Turborepo | `pnpm dev`, `pnpm build` |
| 프레임워크 | Next.js 15 App Router + React 19 | server actions |
| DB | PostgreSQL 16 + Drizzle | `pgvector`, `pg_trgm`, `unaccent` |
| 세션 | PostgreSQL `user_session` (쿠키 `sessionId`) | Redis 제거됨 (2026-04 refactor) |
| 캐시 | `embed_cache` 테이블 + in-memory Map + permissionFingerprint ACL 격리 | pg-boss `cache-cleanup` (6h) |
| 오브젝트 스토리지 | MinIO | 버킷 `jarvis-files` |
| 잡 큐 | pg-boss | 워커 독립 프로세스 |
| LLM | **CLIProxyAPI 게이트웨이** (docker/cli-proxy) → Anthropic/OpenAI | subscription/플랜 중개, budget 게이트 |
| 임베딩 | OpenAI via `packages/ai/embed.ts` | `embed_cache` 통해 dedup |
| 인증 | 이메일+비밀번호 (PostgreSQL 세션) | |
| i18n | next-intl 단일 로케일(`ko`) | `apps/web/messages/ko.json` |
| 테스트 | Vitest + Playwright | `pnpm test`, `pnpm --filter @jarvis/web exec playwright test` |
| 스타일 | Tailwind CSS 4 | 디자인 재구성 예정 |

## 핵심 도메인 (31 스키마 파일 · 52 테이블)

`packages/db/schema/*.ts`. 대분류:

| 도메인 | 파일 | 핵심 테이블 | sensitivity |
|--------|------|-----------|-------------|
| **Knowledge** (사내 위키 본체) | `knowledge.ts`, `review.ts` | knowledge_page, knowledge_page_version, knowledge_claim, owner, tag, review_request | **Yes** (PUBLIC/INTERNAL/RESTRICTED/SECRET_REF_ONLY) |
| **Wiki-fs projection** | `wiki-page-index.ts`, `wiki-page-link.ts`, `wiki-page-source-ref.ts`, `wiki-commit-log.ts`, `wiki-lint-report.ts`, `review-queue.ts` (wiki_review_queue 포함) | wiki_page_index, wiki_page_link, wiki_commit_log, wiki_review_queue, wiki_lint_report | Yes (page-level) |
| **Ask AI** | `ask-conversation.ts`, `feedback.ts`, `directory.ts`, `llm-call-log.ts` | ask_conversation, ask_message, answer_feedback, directory_entry, llm_call_log | No (knowledge layer 경유) |
| **Project & Work** | `project.ts`, `additional-development.ts` | project, project_task, project_inquiry, project_staff, additional_development(+ effort/revenue/staff) | No |
| **System Registry** | `system.ts` | system, system_access | Yes (INTERNAL/RESTRICTED) |
| **Case/Precedent** | `case.ts` | precedent_case, case_cluster | Yes (독립 임베딩 공간) |
| **Graph** | `graph.ts` | graph_snapshot, graph_node, graph_edge, graph_community | Yes |
| **HR/근태** | `attendance.ts` | attendance, out_manage, out_manage_detail | No |
| **Notice** | `notice.ts` | notice | Yes (PUBLIC/INTERNAL) |
| **File** | `file.ts` | raw_source, attachment | Yes |
| **Audit/Search/Master** | `audit.ts`, `search.ts`, `menu.ts`, `code.ts`, `company.ts`, `tenant.ts`, `user.ts` | audit_log, search_log, search_synonym, popular_search, menu_item, code_group/item, company, workspace, organization, user, role, permission, user_role, role_permission | 일부 (e.g. graph) |
| **Infra** | `embed-cache.ts`, `user-session.ts` | embed_cache, user_session | No |

> 스키마 파일이 29→31개로 늘어나는 중(진행형). 추가 도메인 다룰 때는 실제 `packages/db/schema/index.ts`를 먼저 확인.

## Ask AI 파이프라인 (page-first · 6-lane router)

**중요:** 과거의 "claim 벡터 검색 → FTS 재랭킹 → Anthropic" 단일 RAG 파이프라인은 폐기 중(Phase-W4). 현재는 두 축으로 구성:

### 1. 6-Lane 라우터 (`packages/ai/router.ts`)

질문 의도를 **한국어 키워드 패턴 매칭**으로(LLM 없이) 6개 레인 중 하나로 분기:

| 레인 | 트리거 예시 | 컨텍스트 소스 |
|------|-----------|--------------|
| `text-first` | 일반 질문 | page-first retrieval |
| `graph-first` | "어디에 연결", "의존성" | `graph-context.ts` + graph_snapshot |
| `case-first` | "유사 사례", "전례" | `case-context.ts` + precedent_case |
| `directory-first` | "어디서", "담당자", "링크" | `directory-context.ts` + directory_entry |
| `action-first` | "어떻게 신청" | action 플레이북 |
| `tutor-first` | 온보딩 / 퀴즈 | `tutor.ts` multi-turn |

라우터 출력은 레인 + context fetch 지시. 하나의 질문에 여러 레인이 섞일 수 있음.

### 2. Page-first Retrieval (`packages/ai/page-first/`)

Karpathy 원칙. 벡터 대신 **페이지 수준 lexical shortlist**를 쓴다.

```
질문
  → LLM-first shortlist (FEATURE_LLM_SHORTLIST=true) 또는 lexical shortlist
  → 1-hop wikilink 확장
  → wiki-fs reader로 디스크 본문 읽기 (DB 본문 금지)
  → LLM synthesis (Anthropic via CLIProxyAPI)
  → [source:N] citation 포함 SSE 스트리밍
```

**raw chunk RAG 금지.** page가 1차 단위. 근거 면에서 `knowledge_claim.embedding`은 legacy fallback만.

`packages/ai/ask.ts`가 오케스트레이터. `apps/web/app/api/ask/route.ts`가 HTTP 진입. 캐시 키에 `permissionFingerprint`(권한 지문) 포함 → 권한 다르면 강제 miss.

## Wiki-fs SSoT 모델 (Karpathy 방식)

**디스크가 SSoT, DB는 projection only.**

```
wiki/{workspaceId}/
├─ auto/              ← LLM 독점 편집. UI는 viewer 전용.
│  ├─ sources/           원본 문서 요약
│  ├─ entities/          인물·조직·시스템
│  ├─ concepts/          개념·정책
│  ├─ syntheses/         Ask AI "Save as Page"
│  ├─ cases/             사례 요약
│  ├─ playbooks/         업무 플레이북
│  ├─ reports/           정기 리포트
│  ├─ onboarding/        온보딩 트랙
│  └─ derived/code/      Graphify 결과 (격리)
├─ manual/            ← 사람 편집(admin/editor). LLM은 Read only.
│  ├─ overrides/         법무·보안 예외
│  └─ notes/             관리자 해설
├─ _system/           ← 린트·감사 자동 생성
├─ _archive/          ← projection 제외
├─ index.md           ← auto 카탈로그
└─ log.md             ← auto 시간순 로그
```

- 경로 조립은 `resolveWikiPath({ workspaceId, zone, subdir, slug })` 헬퍼만 사용(문자열 concat 금지)
- Git 커밋은 `packages/wiki-fs/git.ts`의 `GitRepo`·`commitPatch` 경유
- DB(`wiki_page_index`, `wiki_page_link` 등)는 **워커 동기화 잡만** INSERT/UPDATE. UI server action은 INSERT 금지(조회만)
- 본문 쓰기는 절대 `wiki_page_index.body` 컬럼으로 가지 않음(디스크가 SSoT)

상세 워크플로우와 위반 패턴은 `jarvis-wiki-feature` 스킬.

## Ingest 4단계 분해 (`apps/worker/src/jobs/ingest/`)

raw_source 1건을 Two-Step CoT로 다수 페이지에 반영:

```
ingest (pg-boss 핸들러)
  ├─ analyze         Step A: 소스 분석 → JSON (keyEntities, keyConcepts, findings, contradictions)
  ├─ generate        Step B: 분석 + 기존 페이지 → 새 wiki 페이지 콘텐츠 생성 (LLM)
  ├─ write-and-commit wiki-fs로 디스크 write + git commit + wiki_commit_log
  └─ review-queue    민감/충돌/PII 감지 시 wiki_review_queue 기록
```

프롬프트 빌더·파서는 `packages/wiki-agent/src/prompts/*` + `parsers/*`. `PROMPT_VERSION` 상수로 스냅숏 관리.

## 주요 패턴

### 1. 페이지 구조 (Next.js App Router)

```
apps/web/app/(app)/{domain}/
├─ page.tsx              # Server Component
├─ layout.tsx            # (선택)
├─ actions.ts            # "use server" 서버 액션
├─ _components/          # 해당 페이지 전용 client component ("use client")
└─ [id]/
   ├─ page.tsx
   └─ edit/page.tsx
```

- `(app)`=인증 필요, `(auth)`=공개
- `_components` 언더스코어 접두사로 라우트에서 제외
- 전역 공통은 `apps/web/components/`
- 도메인 횡단 server action은 `apps/web/app/actions/`

**현재 도메인 라우트:** `admin`, `architecture`, `ask`, `attendance`, `dashboard`, `infra`, `knowledge`, `notices`, `profile`, `projects`, `search`, `systems`, `wiki`.

### 2. 서버 액션 컨벤션

권한 기반 도메인(knowledge, project, system 등):
```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export async function pinPage(pageId: string): Promise<{ ok: boolean; pinnedAt: string | null }> {
  const session = await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  // workspace + sensitivity 필터 필수
}
```

세션 기반 도메인(ask, feedback 등):
```ts
"use server";
import { requireSession } from "@jarvis/auth";

export async function listConversations() {
  const session = await requireSession();
  // workspaceId + userId 이중 필터
}
```

**필수:** 반환 타입 명시 · null/undefined 구별 · sensitivity 컬럼이 있는 엔티티는 쿼리 레벨 필터.

### 3. 권한 (RBAC + sensitivity)

- `packages/shared/constants/permissions.ts`에 **PERMISSIONS 34종** 정의 (KNOWLEDGE_*, PROJECT_*, SYSTEM_*, ATTENDANCE_*, NOTICE_*, ADDITIONAL_DEV_*, GRAPH_*, USER_*, AUDIT_READ, ADMIN_ALL, FILES_WRITE, SYSTEM_ACCESS_SECRET)
- `ROLE_PERMISSIONS` 매핑: **5역할** (ADMIN, MANAGER, DEVELOPER, HR, VIEWER)
  - DEVELOPER는 의도적으로 `KNOWLEDGE_REVIEW` 제외 → wiki_page_index sensitivity=RESTRICTED 페이지 차단 (필요 시 MANAGER 추가 부여)
  - `SYSTEM_ACCESS_SECRET`는 DEVELOPER에 명시적 허용 (credential 접근)
- sensitivity는 `packages/auth/rbac.ts`의 `canAccessKnowledgeSensitivity` + 쿼리 레벨 `buildLegacyKnowledgeSensitivitySqlFilter` 병용 (legacy 필터는 Phase-W4까지)

### 4. 하이브리드 검색 (`packages/search`)

`SearchAdapter` 추상화. `pg-search.ts`는 FTS + trigram + 동의어 → RRF(Reciprocal Rank Fusion) 병합. `precedent-search.ts`는 **독립 벡터 공간**(TF-IDF+SVD) on precedent_case — pg-search와 절대 혼합 금지. freshness/popularity 보정은 `hybrid-ranker.ts`.

### 5. i18n

- 단일 로케일 `ko`. `apps/web/i18n/request.ts`가 `locale='ko'` 하드코딩
- `apps/web/messages/ko.json`에 네임스페이스(`Domain.Section.key`) 구조
- 보간 변수 `{count}`, `{name}` 등 양쪽 일치
- 상세는 `jarvis-i18n` 스킬

### 6. 워커 잡 & 스케줄 (`apps/worker/src/index.ts`)

| 잡 | 트리거 | 역할 |
|----|--------|------|
| `ingest` (+ 4 서브) | 웹 API (raw_source 업로드) | Two-Step CoT → wiki 페이지 생성 |
| `embed` | on-demand | OpenAI 임베딩 → embed_cache |
| `compile` | on-demand | page summary 생성 |
| `graphify-build` | 수동 | 아키텍처 그래프 렌더링 |
| `wiki-bootstrap` | 수동(CLI) | wiki-fs 초기화 |
| `wiki-lint` | 수동/플래그 | frontmatter · wikilink 정합성 |
| `check-freshness` (stale) | **cron `0 9 * * *`** | freshness SLA 초과 페이지 → audit_log |
| `aggregate-popular` | **cron `0 0 * * 0`** (일요일 00:00) | 인기 검색어 집계 |
| `cleanup` | **cron `0 0 1 * *`** (매월 1일) | audit_log / version 아카이빙 |
| `cache-cleanup` | 6시간마다 | embed_cache 만료 + 세션 정리 |

## 주요 명령어

```bash
# 개발
pnpm dev                              # web + worker 동시
pnpm --filter @jarvis/web dev
pnpm --filter @jarvis/worker dev

# 타입/린트/테스트
pnpm type-check
pnpm --filter @jarvis/web type-check  # 빠른 범위
pnpm --filter @jarvis/web lint
pnpm test
pnpm --filter @jarvis/web exec playwright test

# DB
pnpm db:generate                      # schema → migration 자동
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm db:push                          # prod 직접 push (주의)

# 검증 스크립트
node scripts/check-schema-drift.mjs --hook        # 훅 (advisory)
node scripts/check-schema-drift.mjs --precommit   # blocking
pnpm wiki:check                                   # wiki-fs ↔ DB projection drift
pnpm audit:rsc                                    # RSC boundary 위반 감지
pnpm eval:budget-test                             # LLM budget 검증
```

## 인프라 포트 (개발)

| 서비스 | 호스트 포트 |
|-------|------------|
| Next.js web | 3010 |
| PostgreSQL | 5436 |
| MinIO API | 9100 |
| MinIO Console | 9101 |
| cli-proxy | docker-compose에 정의 |

## 자주 혼동되는 것

- **`apps/web/lib/` vs `packages/*`** — 전자는 웹 앱 전용(다른 앱 import 불가), 후자는 web+worker 공유
- **server action vs route handler** — 폼/내부 mutation은 server action, 외부 호출 REST는 `route.ts`
- **`components/` vs `_components/`** — 전자는 전역 공통, 후자는 페이지 전용
- **`wiki-fs` vs `wiki-agent`** — wiki-fs는 **디스크 I/O + git**(stateful), wiki-agent는 **LLM prompt/parser**(stateless). 절대 서로 섞지 말 것
- **`knowledge_page` vs `wiki_page_index`** — 전자는 레거시 Knowledge 도메인, 후자는 Karpathy wiki-fs projection. 현재 이행 중이라 두 테이블이 공존
- **`review_request` vs `review_queue` vs `wiki_review_queue`** — knowledge 수동 리뷰 / PII·Secret 큐 / wiki 도메인 전용 큐 (3개 모두 다른 책임)
- **Drizzle 마이그레이션** — 수동으로 `drizzle/*.sql` 편집 금지, 반드시 `pnpm db:generate`

## 상태 / 진행 중 이슈

- **디자인 재구성 예정** — Tailwind 스타일에 시간 쓰지 말 것
- **Phase-W4: 레거시 RAG 경로 폐지 중** — `document_chunks`, `knowledge_claim.embedding` 제거 대기
- **`systems` → `projects` 라우트 이행** — 최근 rename 완료, 잔존 참조 확인 필요
- **Redis 제거 완료** — 세션은 PostgreSQL `user_session`, 캐시는 `embed_cache` + in-memory
- **CLIProxyAPI 게이트웨이** — 외부 LLM 호출은 `packages/ai/router.ts` → docker cli-proxy → Anthropic/OpenAI
- **5000명 엔터프라이즈 스케일, 1주 스프린트** — 속도 우선, 품질 유지
